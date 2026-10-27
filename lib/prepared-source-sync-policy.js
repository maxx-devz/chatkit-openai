import { DriveSourceError } from "./drive-source-policy.js";
import { PREPARED_SOURCE_LIMITS } from "./prepared-source-policy.js";

export async function prepareSourceDocuments(inventory, previous, readSource, signal) {
  const files = inventory.files.filter(file => file.previewSupported);
  if (files.length > PREPARED_SOURCE_LIMITS.documents) throw new DriveSourceError("source_index_limit", "Prepared sources exceed 100 documents. No partial index was published.", 413);
  if (files.some(file => file.contentRestricted || !/^\d{1,40}$/.test(file.version))) throw new DriveSourceError("source_access_restricted", "A source is restricted or has no verifiable revision. Cached content is unavailable until a complete sync succeeds.", 403);
  const documents = new Array(files.length);
  let next = 0;
  let characters = 0;
  let fetched = 0;
  let stopped = false;
  const worker = async () => {
    try {
      while (!stopped && next < files.length) {
        const index = next++;
        const file = files[index];
        signal?.throwIfAborted();
        const old = previous.find(doc => doc.id === file.id && String(doc.version) === file.version && doc.modifiedTime === file.modifiedTime);
        const document = old || await readSource(file.id, { expectedVersion: file.version, signal });
        if (document.id !== file.id || String(document.version) !== file.version || typeof document.text !== "string" || !document.text.trim()) {
          throw new DriveSourceError("source_revision_changed", "A source changed during preparation. Retry synchronization.", 409);
        }
        if (!old) fetched++;
        characters += document.text.length;
        if (characters > PREPARED_SOURCE_LIMITS.characters) throw new DriveSourceError("source_index_limit", "Prepared sources exceed 2,000,000 characters. No text was silently truncated.", 413);
        documents[index] = { ...document, path: file.path, folders: file.folders || [], name: file.name, modifiedTime: file.modifiedTime };
      }
    } catch (error) { stopped = true; throw error; }
  };
  const results = await Promise.allSettled([worker(), worker()]);
  const failure = results.find(result => result.status === "rejected");
  if (failure) throw failure.reason;
  signal?.throwIfAborted();
  const currentIds = new Set(documents.map(doc => doc.id));
  return { documents, sync: { fetchedDocuments: fetched, reusedDocuments: files.length - fetched,
    removedDocuments: previous.filter(doc => !currentIds.has(doc.id)).length,
    indexedDocuments: documents.length, unsupportedFiles: inventory.files.filter(file => !file.previewSupported).length,
    rootName: inventory.rootName } };
}
