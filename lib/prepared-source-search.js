// Provider-free, revision-scoped search index. Text stays in the encrypted corpus;
// only offsets and normalized term sets are added during background preparation.
export const SOURCE_SEARCH_VERSION = 1;
export const SOURCE_PASSAGE_CHARACTERS = 1600;
const stopWords = new Set("a an and are as at be by can could do does for from have how i in is it its me of on or our please that the their there these they this to was we what when where which who will with would you your source sources document documents file files based approved knowledge cite used always open commerce".split(" "));

export function sourceSearchTerms(value) {
  return [...new Set((String(value).toLowerCase().match(/[\p{L}\p{N}]{2,64}/gu) || [])
    .filter(word => !stopWords.has(word)).map(word => word.length > 4 && word.endsWith("s") ? word.slice(0, -1) : word))];
}

export function prepareSourceSearchIndex(text) {
  const chunks = [];
  for (let start = 0; start < text.length; start += SOURCE_PASSAGE_CHARACTERS - 200) {
    const end = Math.min(text.length, start + SOURCE_PASSAGE_CHARACTERS);
    chunks.push({ start, end, terms: sourceSearchTerms(text.slice(start, end)) });
    if (end === text.length) break;
  }
  return { version: SOURCE_SEARCH_VERSION, length: text.length, chunks };
}

function chunksFor(doc) {
  const index = doc.searchIndex;
  // Old caches remain readable during rollout. The next sync persists this index
  // without re-exporting an unchanged Drive document.
  if (index?.version === SOURCE_SEARCH_VERSION && index.length === doc.text.length
      && Array.isArray(index.chunks) && index.chunks.every(chunk => Number.isSafeInteger(chunk.start)
        && Number.isSafeInteger(chunk.end) && chunk.start >= 0 && chunk.end > chunk.start
        && chunk.end <= doc.text.length && chunk.end - chunk.start <= SOURCE_PASSAGE_CHARACTERS
        && Array.isArray(chunk.terms) && chunk.terms.every(term => typeof term === "string"))) return index.chunks;
  return prepareSourceSearchIndex(doc.text).chunks;
}

export function searchCompanyPassages(documents, question) {
  if (/^\s*(hi|hello|hey|thanks|thank you)[!.\s]*$/i.test(question)) return [];
  const terms = sourceSearchTerms(question).slice(0, 24);
  if (!terms.length) return [];
  const indexed = documents.map(doc => ({ doc, chunks: chunksFor(doc), titleTerms: sourceSearchTerms(doc.name) }));
  const frequencies = new Map(terms.map(term => [term, indexed.filter(entry =>
    entry.titleTerms.includes(term) || entry.chunks.some(chunk => chunk.terms.includes(term))).length]));
  const candidates = [];
  for (const entry of indexed) {
    for (const chunk of entry.chunks) {
      const score = terms.reduce((sum, term) => sum + (Math.log1p((indexed.length + 1) / (frequencies.get(term) + 1))
        * ((entry.titleTerms.includes(term) ? 2 : 0) + (chunk.terms.includes(term) ? 3 : 0))), 0);
      candidates.push({ doc: entry.doc, start: chunk.start, end: chunk.end, score });
    }
  }
  candidates.sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id) || a.start - b.start);
  const selected = [], usedDocuments = new Set();
  // Prefer diverse supporting documents rather than four near-identical windows
  // from a long project directory. Reserve a passage for the relevant operating guide.
  const guide = candidates.find(item => /\b(start here|starter guide|overview|guidelines|instructions|operating guide)\b/i.test(item.doc.name));
  for (const item of candidates) {
    if (item.score <= 0 || usedDocuments.has(item.doc.id)) continue;
    selected.push(item); usedDocuments.add(item.doc.id);
    if (selected.length === 3) break;
  }
  if (guide && !usedDocuments.has(guide.doc.id)) {
    if (selected.length === 3) selected.pop();
    selected.push(guide);
  }
  return selected.map(item => ({ doc: item.doc, text: item.doc.text.slice(item.start, item.end) }));
}
