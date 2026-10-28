import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PREPARED_SOURCE_LIMITS, validateSourcePublication, sourceAudience, sourceFolders,
  assertPreparedSourceFreshness, approvedSourceInstructions, retrievePreparedReferences,
  appendPreparedInstructions } from "../lib/prepared-source-policy.js";
import { CLIENT_SOURCE_PRIVACY_NOTICE } from "../lib/prepared-source-policy.js";
import { prepareSourceDocuments } from "../lib/prepared-source-sync-policy.js";
import { spreadsheetValuesText, assertBoundedSpreadsheetArchive, extractDriveSpreadsheet } from "../lib/drive-spreadsheet.js";
import { assertBoundedOfficeArchive, extractDriveDocx } from "../lib/drive-office.js";

const docs = [
  { id: "company_rules_123", name: "Approved company rules", path: "01 - [SOURCE] Brand / Rules", folders: [{ id: "brand_folder_123", path: "01 - [SOURCE] Brand" }], version: "1", text: "Always distinguish proposed work from verified work.", modifiedTime: "2026-10-21", previewSupported: true },
  { id: "client_a_doc_123", name: "Website access guide", path: "Client A / Website / Guide", folders: [{ id: "client_a_folder_123", path: "Client A" }, { id: "website_folder_123", path: "Client A / Website" }], version: "1", text: "Ask for delegated access, never passwords.", modifiedTime: "2026-10-21", previewSupported: true },
  { id: "client_b_doc_123", name: "Private website plan", path: "Client B / Private", folders: [{ id: "client_b_folder_123", path: "Client B" }], version: "1", text: "Client B private website plan.", modifiedTime: "2026-10-21", previewSupported: true },
];
const config = overrides => ({ action: "save", clientId: "1", enabled: true, consent: true, referencePaths: ["client_a_folder_123"],
  instructionIds: [docs[0].id], additionalInstructions: "Keep answers brief.", generalReferences: false, ...overrides });

test("Audience approval is explicit and the entire root cannot be published to clients", () => {
  assert.equal(sourceAudience(null), "admin");
  assert.equal(sourceAudience("1"), "client:1");
  assert.equal(sourceAudience("clients"), "clients");
  assert.throws(() => sourceAudience("1 OR 1=1"));
  assert.equal(validateSourcePublication(config(), docs).clientId, "1");
  for (const change of [{ consent: false }, { referencePaths: [""] }, { referencePaths: ["Client"] },
    { referencePaths: ["client_a_folder_123"], root: "elsewhere" }, { instructionIds: ["missing"] },
    { enabled: "true" }, { generalReferences: "true" }, { referencePaths: ["client_a_folder_123", "client_a_folder_123"] }]) {
    assert.throws(() => validateSourcePublication(config(change), docs));
  }
  assert.doesNotThrow(() => validateSourcePublication(config({ clientId: null, referencePaths: [""] }), docs));
  assert.deepEqual(sourceFolders(docs).map(folder => folder.path), ["01 - [SOURCE] Brand", "Client A", "Client A / Website", "Client B"]);
});

test("Shared parent approval is explicit, automatic, and unavailable to client-only extras", () => {
  const shared = validateSourcePublication(config({ clientId: "clients", referencePaths: ["brand_folder_123"] }), docs);
  assert.equal(shared.audience, "clients");
  assert.equal(shared.clientId, null);
  const automatic = validateSourcePublication(config({ clientId: "clients", referencePaths: [""], instructionIds: [] }), docs);
  assert.equal(automatic.audience, "clients");
  assert.throws(() => validateSourcePublication(config({ clientId: "1", referencePaths: [""] }), docs), /company parent/);
  assert.throws(() => validateSourcePublication(config({ clientId: "clients", referencePaths: [""], instructionIds: [], consent: false }), docs), /Approve/);
  assert.throws(() => validateSourcePublication(config({ clientId: "clients", referencePaths: [""] }), docs), /Clear the optional/);
  assert.throws(() => validateSourcePublication(config({ clientId: "clients", consent: false }), docs), /Approve/);
  assert.doesNotMatch(JSON.stringify(retrievePreparedReferences(shared, docs, "website")), /Client B/);
});

test("Mandatory instructions and separate guidance apply even when reference search returns nothing", () => {
  const publication = validateSourcePublication(config(), docs);
  const instructions = approvedSourceInstructions(publication, docs);
  assert.match(instructions, /Always distinguish/);
  assert.match(instructions, /Separate administrator-added.*\nKeep answers brief/s);
  assert.deepEqual(retrievePreparedReferences(publication, docs, "Hello", "general"), []);
  assert.match(appendPreparedInstructions("Fixed security rules", instructions), /^Fixed security rules/);
  assert.match(appendPreparedInstructions("Fixed security rules", instructions), /cannot override application security/);
  assert.equal(appendPreparedInstructions("Fixed security rules", ""), "Fixed security rules");
});

test("Client guidance omits source headers and forbids metadata disclosure without changing private admin headers", () => {
  const publication = validateSourcePublication(config(), docs);
  const privateInstructions = approvedSourceInstructions(publication, docs, { privateSources: true });
  assert.match(privateInstructions, /Always distinguish proposed work/);
  assert.doesNotMatch(privateInstructions, /Approved company rules|revision 1/);
  assert.match(approvedSourceInstructions(publication, docs), /Approved company rules/);
  assert.match(CLIENT_SOURCE_PRIVACY_NOTICE, /Do not add internal source citations/);
  assert.match(CLIENT_SOURCE_PRIVACY_NOTICE, /permitted Hubstaff tasks/);
});

test("Reference retrieval filters audience before ranking and General mode is independent", () => {
  const publication = validateSourcePublication(config(), docs);
  const result = retrievePreparedReferences(publication, docs, "website access passwords");
  assert.equal(result.length, 1);
  assert.match(result[0].text, /delegated access/);
  assert.equal(JSON.stringify(result).includes("Client B"), false);
  assert.equal(JSON.stringify(result).includes("company_rules_123"), false);
  assert.equal("path" in result[0], false);
  assert.equal(result[0].citation.length, 16);
  assert.deepEqual(retrievePreparedReferences(publication, docs, "website", "general"), []);
  assert.equal(retrievePreparedReferences({ ...publication, generalReferences: true }, docs, "website", "general").length, 1);
  assert.deepEqual(retrievePreparedReferences(publication, docs, "unrelated question"), []);
  const collision = { ...docs[2], path: "Client Aardvark / Guide" };
  assert.equal(retrievePreparedReferences(publication, [collision], "website").length, 0);
});

test("New approved-folder references and edits are picked up but never become mandatory rules", () => {
  const publication = validateSourcePublication(config(), docs);
  const added = { ...docs[1], id: "added_document", name: "New website policy", path: "Client A / New", text: "New website approval policy." };
  assert.equal(retrievePreparedReferences(publication, [...docs, added], "website approval").some(ref => ref.name === added.name), true);
  assert.equal(approvedSourceInstructions(publication, [...docs, added]).includes(added.text), false);
  const updated = docs.map(doc => doc.id === docs[0].id ? { ...doc, version: "2", text: "Revised approved rule." } : doc);
  assert.match(approvedSourceInstructions(publication, updated), /Revised approved rule/);
  assert.throws(() => approvedSourceInstructions(publication, docs.slice(1)), /removed or became inaccessible/);
  assert.throws(() => approvedSourceInstructions(publication, [{ ...docs[0], text: "X".repeat(10001) }]), /grew beyond/);
});

test("Stale, failed, incomplete and differently bound caches fail closed", () => {
  const now = Date.now();
  const index = { binding: "connection-a", checked_at: new Date(now).toISOString() };
  assert.doesNotThrow(() => assertPreparedSourceFreshness(index, "connection-a", now));
  for (const bad of [null, { ...index, failure_code: "access_denied" }, { ...index, checked_at: "invalid" },
    { ...index, checked_at: new Date(now - PREPARED_SOURCE_LIMITS.freshnessMilliseconds - 1) }]) {
    assert.throws(() => assertPreparedSourceFreshness(bad, "connection-a", now));
  }
  assert.throws(() => assertPreparedSourceFreshness(index, "connection-b", now));
});

test("Instruction limits reject excess rather than silently dropping rules", () => {
  assert.throws(() => validateSourcePublication(config({ additionalInstructions: "a".repeat(4001) }), docs));
  assert.throws(() => validateSourcePublication(config({ additionalInstructions: "bad\u0000text" }), docs));
  assert.throws(() => validateSourcePublication(config(), [{ ...docs[0], text: "a".repeat(10001) }, ...docs.slice(1)]));
});

test("Prepared synchronization exports only new or changed revisions and drops removed sources", async () => {
  const reads = [];
  const inventory = { rootName: "Company Knowledge", files: docs.slice(0, 2) };
  const read = async (id, options) => { reads.push({ id, options }); return docs.find(doc => doc.id === id); };
  const first = await prepareSourceDocuments(inventory, [], read);
  const second = await prepareSourceDocuments(inventory, first.documents, read);
  assert.equal(reads.length, 2);
  assert.equal(second.sync.reusedDocuments, 2);
  const removed = await prepareSourceDocuments({ ...inventory, files: [docs[0]] }, second.documents, read);
  assert.equal(removed.sync.removedDocuments, 1);
  assert.equal(removed.documents.length, 1);
  const updated = { ...docs[0], version: "2", text: "Changed rule" };
  const changed = await prepareSourceDocuments({ ...inventory, files: [updated] }, removed.documents, async () => updated);
  assert.equal(changed.sync.fetchedDocuments, 1);
  assert.equal(changed.documents[0].text, "Changed rule");
});

test("Preparation bounds concurrency and rejects partial/denied/mismatched data", async () => {
  let concurrent = 0, peak = 0;
  const many = Array.from({ length: 7 }, (_, index) => ({ ...docs[0], id: "doc_" + index }));
  const result = await prepareSourceDocuments({ files: many }, [], async id => {
    concurrent++; peak = Math.max(peak, concurrent); await new Promise(resolve => setImmediate(resolve)); concurrent--;
    return many.find(doc => doc.id === id);
  });
  assert.equal(result.documents.length, 7); assert.equal(peak, 2);
  await assert.rejects(prepareSourceDocuments({ files: [{ ...docs[0], contentRestricted: true }] }, docs, async () => { throw new Error("must not read"); }), /restricted/);
  await assert.rejects(prepareSourceDocuments({ files: [docs[0]] }, [], async () => ({ ...docs[0], version: "3" })), /changed during/);
  await assert.rejects(prepareSourceDocuments({ files: [docs[0]] }, [], async () => { throw new Error("Google denied access"); }), /denied/);
  await assert.rejects(prepareSourceDocuments({ files: Array(101).fill(docs[0]) }, [], async () => docs[0]), /100 documents/);
  const cancelled = new AbortController(); cancelled.abort();
  await assert.rejects(prepareSourceDocuments({ files: [docs[0]] }, [], async () => docs[0], cancelled.signal));
});

test("Spreadsheet values preserve all sheets, Unicode, false, zero and date values", () => {
  const text = spreadsheetValuesText([{ sheet: "First", data: [["Name", "Value"], ["A", 0], ["B", false]] },
    { sheet: "Second", data: [["Policy", "日本語"], [new Date("2026-10-21T00:00:00Z"), null]] }]);
  assert.match(text, /First/); assert.match(text, /Second/); assert.match(text, /日本語/);
  assert.match(text, /false/); assert.match(text, /2026-10-21T00:00:00.000Z/);
  assert.throws(() => spreadsheetValuesText([{ sheet: "Huge", data: [Array(50001).fill(0)] }]), /50,000/);
  assert.throws(() => assertBoundedSpreadsheetArchive(Buffer.from("not a spreadsheet")));
});

// Small standard ZIP fixture, stored entries with CRC32; no network or disk writes.
function zip(files) {
  const local = [], directory = []; let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const filename = Buffer.from(name), content = Buffer.from(text);
    let crc = 0xffffffff;
    for (const byte of content) { crc ^= byte; for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0); }
    crc = (crc ^ 0xffffffff) >>> 0;
    const head = Buffer.alloc(30); head.writeUInt32LE(0x04034b50); head.writeUInt16LE(20, 4);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(content.length, 18); head.writeUInt32LE(content.length, 22); head.writeUInt16LE(filename.length, 26);
    local.push(head, filename, content);
    const central = Buffer.alloc(46); central.writeUInt32LE(0x02014b50); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(content.length, 20); central.writeUInt32LE(content.length, 24); central.writeUInt16LE(filename.length, 28); central.writeUInt32LE(offset, 42);
    directory.push(central, filename); offset += head.length + filename.length + content.length;
  }
  const catalog = Buffer.concat(directory), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(catalog.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, catalog, end]);
}

test("Google XLSX extraction reads second worksheet and rejects expansion bombs", async () => {
  const ns = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
  const workbook = zip({
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>',
    "xl/workbook.xml": `<workbook xmlns="${ns}" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="First" sheetId="1" r:id="rId1"/><sheet name="Second" sheetId="2" r:id="rId2"/></sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/></Relationships>',
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${ns}"><dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>First sheet policy</t></is></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet xmlns="${ns}"><dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>Second sheet instruction</t></is></c></row></sheetData></worksheet>`,
  });
  const text = await extractDriveSpreadsheet(new Response(workbook));
  assert.match(text, /First sheet policy/); assert.match(text, /Second sheet instruction/);
  const bad = Buffer.from(workbook);
  const central = bad.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02])); bad.writeUInt32LE(100_000_000, central + 24);
  assert.throws(() => assertBoundedSpreadsheetArchive(bad), /safe extraction limits/);
});

test("DOCX text is extracted without converting originals or following external links", async () => {
  const file = zip({
    "[Content_Types].xml": '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
    "_rels/.rels": '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
    "word/document.xml": '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Approved company services.</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Support policy.</w:t></w:r></w:p></w:tc></w:tr></w:tbl></w:body></w:document>',
  });
  assert.match(await extractDriveDocx(new Response(file)), /Approved company services/);
  assert.match(await extractDriveDocx(new Response(file)), /Support policy/);
  for (const files of [{ "../escape.xml": "bad" }, { "test.xml": '<!DOCTYPE foo [<!ENTITY x SYSTEM "file:///private">]><foo/>' }]) {
    assert.throws(() => assertBoundedOfficeArchive(zip(files)), /safe extraction limits/);
  }
  const corrupt = Buffer.from(file); corrupt[40] ^= 1;
  assert.throws(() => assertBoundedOfficeArchive(corrupt), /safe extraction limits/);
  await assert.rejects(extractDriveDocx(new Response(Buffer.from("not a docx"))), /safe extraction limits/);
});

test("Chat source context contains no Drive/provider network code and is wired to both chat endpoints", async () => {
  const context = await readFile(new URL("../lib/prepared-source-context.js", import.meta.url), "utf8");
  assert.doesNotMatch(context, /from .*drive-source-service|fetch\(|new OpenAI|synchronizePreparedSources/);
  const client = await readFile(new URL("../app/api/chatkit/route.js", import.meta.url), "utf8");
  const admin = await readFile(new URL("../app/api/admin/assistant/route.js", import.meta.url), "utf8");
  assert.match(client, /loadPreparedSourceContext\(\{ clientId: context.clientId \}/);
  assert.match(client, /source_references: prepared.references/);
  assert.match(admin, /loadPreparedSourceContext\(\{ ownerId: admin.id \}/);
  assert.match(admin, /appendPreparedInstructions/);
});
