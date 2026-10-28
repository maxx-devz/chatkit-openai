import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateSourcePublication, retrievePreparedReferences, approvedSourceInstructions } from "../lib/prepared-source-policy.js";
import { prepareSourceSearchIndex, searchCompanyPassages } from "../lib/prepared-source-search.js";
import { prepareSourceDocuments } from "../lib/prepared-source-sync-policy.js";

const publication = { action: "save", clientId: "clients", enabled: true, referencePaths: [""], instructionIds: [],
  additionalInstructions: "", generalReferences: true, consent: true };
const document = (id, name, text) => ({ id, name, text, path: "Company / " + name, folders: [], version: "1", modifiedTime: "2026-10-28", previewSupported: true });
const docs = [document("guide_document_123", "START HERE - Company Knowledge Project Overview", "Use approved company sources and distinguish proposed work from completed work. ".repeat(200)),
  document("service_document_123", "Company Services", "AOC offers ecommerce design, development and migrations. ".repeat(300)),
  document("history_document_123", "Company history", "The company history and milestones are recorded here."),
  document("other_document_123", "Spreadsheet guide", "Spreadsheet import procedures and reporting steps.")];

test("One approved parent accepts large guides without marking every file as mandatory input", () => {
  const approved = validateSourcePublication(publication, docs);
  const instructions = approvedSourceInstructions(approved, docs);
  assert.match(instructions, /source of truth/);
  assert.match(instructions, /applicable business guidance/);
  assert.ok(instructions.length < 1500);
  assert.ok(docs[0].text.length > 10_000);
  assert.doesNotMatch(instructions, /proposed work from completed work/);
  const references = retrievePreparedReferences(approved, docs, "What services does AOC offer?");
  assert.ok(references.some(reference => reference.name === "Company Services"));
  assert.ok(references.some(reference => reference.name.startsWith("START HERE")));
  assert.ok(references.length <= 3);
  assert.ok(references.every(reference => reference.text.length <= 1600 && reference.usage === "company_guidance"));
  assert.ok(references.reduce((sum, reference) => sum + reference.text.length, 0) <= 4800);
});

test("New files and changed source guidance participate without new folder/document selections", () => {
  const approved = validateSourcePublication(publication, docs);
  const added = document("shipping_document_123", "Shipping service", "Parcel shipping procedures require shipping carrier confirmation.");
  assert.ok(retrievePreparedReferences(approved, [...docs, added], "shipping carrier").some(reference => reference.name === added.name));
  const changed = { ...added, version: "2", text: "Shipping carrier confirmation now requires the new procedure." };
  assert.ok(retrievePreparedReferences(approved, [...docs, changed], "shipping carrier").some(reference => reference.revision === "2"));
  assert.ok(!retrievePreparedReferences(approved, docs, "shipping carrier").some(reference => reference.name === added.name));
});

test("Prepared passage index is persisted on sync without exporting unchanged originals", async () => {
  const previous = docs.map(doc => ({ ...doc }));
  let exports = 0;
  const prepared = await prepareSourceDocuments({ files: docs }, previous, async () => { exports++; throw new Error("must reuse"); });
  assert.equal(exports, 0);
  assert.equal(prepared.sync.reusedDocuments, docs.length);
  assert.ok(prepared.documents.every(doc => doc.searchIndex.version === 1));
  const result = searchCompanyPassages(prepared.documents, "services development migrations");
  assert.ok(result.some(item => item.doc.id === "service_document_123"));
  assert.deepEqual(searchCompanyPassages(prepared.documents, "hello"), []);
  assert.deepEqual(prepareSourceSearchIndex("").chunks, []);
});

test("Automatic General chat reference access remains admin-controlled and never claims all files were read", () => {
  const approved = validateSourcePublication(publication, docs);
  assert.deepEqual(retrievePreparedReferences({ ...approved, generalReferences: false }, docs, "services", "general"), []);
  assert.ok(retrievePreparedReferences(approved, docs, "services", "general").length > 0);
  assert.match(approvedSourceInstructions(approved, docs), /not every file/);
  assert.match(approvedSourceInstructions(approved, docs), /do not grant access to another client's project/i);
});

test("The shared UI defaults to automatic parent mode and hides manual document selectors in that mode", async () => {
  const source = await readFile(new URL("../components/admin/prepared-source-settings.js", import.meta.url), "utf8");
  assert.match(source, /const sharedEmpty = .*referencePaths: \[""\]/);
  assert.match(source, /Use the configured Company Knowledge parent automatically/);
  assert.match(source, /!automaticParent && <>[\s\S]*Mandatory business-instruction documents[\s\S]*<\/>\}/);
});
