import { DriveSourceError, digestDriveValue } from "./drive-source-policy.js";

export const AUTO_SOURCE_LIMITS = Object.freeze({ documents: 40, cacheCharacters: 2_000_000, owners: 5,
  cacheMilliseconds: 10 * 60_000, contextDocuments: 8, excerptCharacters: 4000, directoryEntries: 200 });
const stopWords = new Set("a an and are as at be been by can could do does for from have how i in is it its me of on or our please should that the their there these they this to use was we what when where which who will with would you your according source sources document documents file files".split(" "));
const words = text => [...new Set((String(text).toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) || []).filter(word => !stopWords.has(word)))];
const changed = (old, file) => !old || old.version !== file.version || old.modifiedTime !== file.modifiedTime;

export function automaticSourceContext(documents, inventory, question, sync) {
  const terms = words(question);
  const frequencies = new Map(terms.map(term => [term, documents.filter(doc => (doc.name + " " + doc.text).toLowerCase().includes(term)).length]));
  const chunks = documents.map(document => {
    const title = (document.name + " " + (document.path || "")).toLowerCase();
    const ranked = [];
    for (let start = 0; start < document.text.length; start += AUTO_SOURCE_LIMITS.excerptCharacters - 400) {
      const end = Math.min(document.text.length, start + AUTO_SOURCE_LIMITS.excerptCharacters);
      const text = document.text.slice(start, end).toLowerCase();
      let score = terms.reduce((sum, term) => sum + (title.includes(term) ? 6 : 0)
        + (text.includes(term) ? 1 + Math.log(1 + documents.length / (1 + frequencies.get(term))) : 0), 0);
      if (/\b(new|latest|added|updated|changed|recent)\b/i.test(question)) score += (Date.parse(document.modifiedTime) || 0) / 1e12;
      ranked.push({ start, end, score });
      if (end === document.text.length) break;
    }
    ranked.sort((a, b) => b.score - a.score || a.start - b.start);
    return { document, ranked, score: ranked[0]?.score || 0 };
  }).sort((a, b) => b.score - a.score || a.document.name.localeCompare(b.document.name));
  const selected = chunks.slice(0, AUTO_SOURCE_LIMITS.contextDocuments).map(({ document, ranked }) => {
    let ranges = document.text.length <= 8000 ? [{ start: 0, end: document.text.length }] : ranked.slice(0, 2).sort((a, b) => a.start - b.start);
    if (ranges.length === 2 && ranges[0].end >= ranges[1].start) ranges = [{ start: ranges[0].start, end: ranges[1].end }];
    const text = ranges.map(range => document.text.slice(range.start, range.end)).join("\n\n[Non-adjacent excerpt; intervening source content not included]\n\n");
    return { ...document, text, coverage: ranges.length === 1 && ranges[0].start === 0 && ranges[0].end === document.text.length ? "full" : "excerpts",
      originalCharacters: document.text.length, providedCharacters: text.length };
  });
  const directory = [];
  let directoryCharacters = 0;
  for (const file of inventory.files.slice(0, AUTO_SOURCE_LIMITS.directoryEntries)) {
    const entry = { id: file.id, name: file.name, path: file.path, version: file.version, modifiedTime: file.modifiedTime,
      contentIndexed: file.previewSupported, contentAvailableInThisAnswer: selected.some(doc => doc.id === file.id) };
    directoryCharacters += JSON.stringify(entry).length;
    if (directoryCharacters > 24_000) break;
    directory.push(entry);
  }
  return { documents: selected, directory,
    sync: { ...sync, indexedDocuments: documents.length, contextDocuments: selected.length,
      unsupportedFiles: inventory.files.filter(file => !file.previewSupported).length,
      directoryEntries: directory.length, directoryComplete: directory.length === inventory.files.length, totalFiles: inventory.files.length,
      retrieval: "Local lexical retrieval; relevant excerpts, not all document text, are supplied to the model." } };
}

// Isolated prototype cache: no provider calls, durable text storage, or account-wide globals in browser state.
// Fresh folder metadata is checked on EVERY question, including when cached text is reused.
export function createAutomaticSourceLoader({ getBinding, listSources, readSource, now = Date.now }) {
  const cache = new Map();
  const active = new Set();
  const clear = ownerId => {
    const entry = cache.get(String(ownerId));
    if (entry?.timer) clearTimeout(entry.timer);
    return cache.delete(String(ownerId));
  };

  async function load(ownerId, question, { signal } = {}) {
    ownerId = String(ownerId);
    signal?.throwIfAborted();
    if (active.has(ownerId)) throw new DriveSourceError("source_sync_busy", "Your source synchronization is already running. Retry shortly.", 409);
    if (active.size >= AUTO_SOURCE_LIMITS.owners) throw new DriveSourceError("source_sync_busy", "Private source synchronization is busy. Retry shortly.", 429);
    active.add(ownerId);
    try {
      for (const [key, entry] of cache) if (entry.expiresAt < now()) clear(key);
      const binding = await getBinding(ownerId);
      const previous = cache.get(ownerId)?.binding === binding ? cache.get(ownerId) : null;
      const inventory = await listSources(ownerId, { signal });
      const supported = inventory.files.filter(file => file.previewSupported);
      if (supported.some(file => file.contentRestricted)) throw new DriveSourceError("source_access_restricted", "Google restricted content access to a source. Cached text will not be reused; review source access before retrying.", 403);
      if (!supported.length) throw new DriveSourceError("no_source_documents", "No supported Google Docs or Sheets are available under the eligible parent sources.", 422);
      if (supported.length > AUTO_SOURCE_LIMITS.documents) throw new DriveSourceError("auto_source_limit", "The private automatic test supports up to 40 documents. No partial index is used.", 413);
      if (supported.some(file => !/^\d{1,40}$/.test(file.version))) throw new DriveSourceError("source_revision_missing", "Google did not return a verifiable revision for every document. Retry source synchronization.", 502);
      const documents = new Array(supported.length);
      let next = 0;
      let stopped = false;
      let fetched = 0;
      let characters = 0;
      const worker = async () => {
        try {
          while (!stopped && next < supported.length) {
            const index = next++;
            const file = supported[index];
            signal?.throwIfAborted();
            const old = previous?.documents.find(doc => doc.id === file.id);
            const document = changed(old, file) ? await readSource(ownerId, file.id, { expectedVersion: file.version, signal }) : old;
            signal?.throwIfAborted();
            if (document.id !== file.id || String(document.version) !== file.version || typeof document.text !== "string" || !document.text.trim()) {
              throw new DriveSourceError("source_revision_changed", "A source changed or became unreadable during synchronization. Retry before asking AI.", 409);
            }
            if (changed(old, file)) fetched++;
            characters += document.text.length;
            if (characters > AUTO_SOURCE_LIMITS.cacheCharacters) throw new DriveSourceError("auto_source_limit", "The automatic private index exceeds 2,000,000 characters. No partial or truncated corpus is sent to AI.", 413);
            documents[index] = { ...document, id: file.id, version: file.version, name: file.name, path: file.path, modifiedTime: file.modifiedTime };
          }
        } catch (error) { stopped = true; throw error; }
      };
      // Bound Google concurrency; wait for both workers to stop before releasing the owner lock.
      const completed = await Promise.allSettled([worker(), worker()]);
      const failure = completed.find(result => result.status === "rejected");
      if (failure) throw failure.reason;
      signal?.throwIfAborted();
      if (documents.reduce((sum, doc) => sum + doc.text.length, 0) > AUTO_SOURCE_LIMITS.cacheCharacters) {
        throw new DriveSourceError("auto_source_limit", "The automatic private index exceeds 2,000,000 characters. No partial or truncated corpus is sent to AI.", 413);
      }
      // Reconnects/credential or root changes during synchronization invalidate the entire result.
      if (await getBinding(ownerId) !== binding) throw new DriveSourceError("source_connection_changed", "The Drive connection changed. Synchronize again before asking AI.", 409);
      const previousIds = new Set(previous?.documents.map(doc => doc.id) || []);
      const ids = new Set(documents.map(doc => doc.id));
      const sync = { checkedAt: new Date(now()).toISOString(), rootName: inventory.rootName, fetchedDocuments: fetched,
        reusedDocuments: documents.length - fetched, addedDocuments: documents.filter(doc => !previousIds.has(doc.id)).length,
        removedDocuments: [...previousIds].filter(id => !ids.has(id)).length };
      clear(ownerId);
      while (cache.size >= AUTO_SOURCE_LIMITS.owners) clear(cache.keys().next().value);
      const entry = { binding, documents, expiresAt: now() + AUTO_SOURCE_LIMITS.cacheMilliseconds };
      entry.timer = setTimeout(() => { if (cache.get(ownerId) === entry) clear(ownerId); }, AUTO_SOURCE_LIMITS.cacheMilliseconds);
      entry.timer.unref?.();
      cache.set(ownerId, entry);
      return automaticSourceContext(documents, inventory, question, sync);
    } catch (error) { clear(ownerId); throw error; }
    finally { active.delete(ownerId); }
  }
  return { load, clear };
}

export function sourceConnectionBinding(status, clientId) {
  if (!status?.connected) throw new DriveSourceError("not_connected", "Connect your authorized Google account before asking AI to use automatic sources.", 409);
  return digestDriveValue(JSON.stringify([clientId, status.rootFolderId, status.email, status.connectedAt]));
}
