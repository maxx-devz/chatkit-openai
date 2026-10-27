import test from "node:test";
import assert from "node:assert/strict";
import { AUTO_SOURCE_LIMITS, createAutomaticSourceLoader, automaticSourceContext, sourceConnectionBinding } from "../lib/drive-source-auto.js";
import { validateSourceTestRequest } from "../lib/drive-source-test-policy.js";
import { createPrivateSourceTester } from "../lib/drive-source-test-runner.js";

const doc = (id = "document_auto_123", text = "Company policy requires approval.") => ({ id, name: id, path: "01 - [SOURCE] / " + id,
  version: "1", modifiedTime: "2026-10-21T01:00:00Z", text, previewSupported: true });
const request = { mode: "automatic", consent: true, question: "What policy applies?", provider: "openai", model: "unit-test-model" };

function fixture() {
  const state = { files: [doc()], reads: [], lists: 0, binding: "connection-1", time: 1000, denied: false, peak: 0, concurrent: 0 };
  const loader = createAutomaticSourceLoader({
    now: () => state.time,
    getBinding: async ownerId => ownerId + ":" + state.binding,
    listSources: async () => { state.lists++; if (state.denied) throw new Error("permission revoked");
      return { rootName: "Company Knowledge", files: state.files.map(({ text: _text, ...file }) => ({ ...file })) }; },
    readSource: async (ownerId, id, options) => {
      state.reads.push({ ownerId, id, options }); state.concurrent++; state.peak = Math.max(state.peak, state.concurrent);
      await new Promise(resolve => setImmediate(resolve)); state.concurrent--;
      return { ...state.files.find(file => file.id === id) };
    },
  });
  return { state, ...loader };
}

test("Automatic mode requires consent and rejects browser source/root overrides", () => {
  assert.equal(validateSourceTestRequest(request).mode, "automatic");
  for (const override of [{ consent: false }, { sources: [{ id: "outside_file", version: "1", role: "reference" }] },
    { rootId: "unapproved_root" }, { mode: "something-else" }]) assert.throws(() => validateSourceTestRequest({ ...request, ...override }));
});

test("Automatic loader rechecks metadata on each question and reuses unchanged text", async () => {
  const { state, load } = fixture();
  const first = await load("admin-A", "policy");
  const second = await load("admin-A", "approval");
  assert.equal(state.lists, 2);
  assert.equal(state.reads.length, 1);
  assert.equal(first.sync.fetchedDocuments, 1);
  assert.equal(second.sync.reusedDocuments, 1);
  assert.equal(state.reads[0].options.expectedVersion, "1");
});

test("New source files are automatically discovered without any new browser IDs", async () => {
  const { state, load } = fixture();
  await load("admin-A", "policy");
  state.files.push(doc("new_source_document", "The new policy requires leadership approval."));
  const updated = await load("admin-A", "new policy");
  assert.equal(state.reads.length, 2);
  assert.equal(updated.sync.addedDocuments, 1);
  assert.equal(updated.sync.reusedDocuments, 1);
  assert.equal(updated.directory.some(file => file.id === "new_source_document"), true);
  assert.equal(updated.documents.some(file => file.text.includes("leadership approval")), true);
});

test("Changed source revisions replace cached text; deleted/moved-out sources disappear", async () => {
  const { state, load } = fixture();
  state.files.push(doc("other_document_456", "Other current policy."));
  await load("admin-A", "policy");
  state.files[0] = { ...state.files[0], version: "2", text: "REVISED policy requires new approval." };
  state.files.pop();
  const updated = await load("admin-A", "policy");
  assert.equal(state.reads.length, 3);
  assert.equal(updated.sync.removedDocuments, 1);
  assert.equal(updated.documents[0].text, "REVISED policy requires new approval.");
  assert.equal(updated.directory.some(file => file.id === "other_document_456"), false);
});

test("Cached data is isolated between owners and invalidated by reconnect or expiry", async () => {
  const { state, load } = fixture();
  await load("admin-A", "policy"); await load("admin-B", "policy");
  assert.equal(state.reads.length, 2);
  state.binding = "reconnected";
  await load("admin-A", "policy");
  assert.equal(state.reads.length, 3);
  state.time += AUTO_SOURCE_LIMITS.cacheMilliseconds + 1;
  await load("admin-A", "policy");
  assert.equal(state.reads.length, 4);
});

test("Revocation fails closed; a subsequent success cannot reuse the discarded corpus", async () => {
  const { state, load } = fixture();
  await load("admin-A", "policy");
  state.denied = true;
  await assert.rejects(load("admin-A", "policy"), /permission revoked/);
  state.denied = false;
  await load("admin-A", "policy");
  assert.equal(state.reads.length, 2);
});

test("Unsupported formats are reported but never exported or pretended to be read", async () => {
  const { state, load } = fixture();
  state.files.push({ ...doc("spreadsheet_document"), previewSupported: false, mimeType: "application/vnd.google-apps.spreadsheet" });
  const context = await load("admin-A", "policy");
  assert.equal(state.reads.length, 1);
  assert.equal(context.sync.unsupportedFiles, 1);
  assert.equal(context.directory.find(file => file.id === "spreadsheet_document").contentIndexed, false);
});

test("Automatic ingestion bounds concurrency and refuses oversized/incomplete corpora", async () => {
  const { state, load } = fixture();
  state.files = Array.from({ length: 5 }, (_, i) => doc("document_auto_" + i));
  await load("admin-A", "policy");
  assert.equal(state.peak, 2);
  state.files = Array.from({ length: AUTO_SOURCE_LIMITS.documents + 1 }, (_, i) => doc("document_auto_" + i));
  await assert.rejects(load("admin-A", "policy"), /up to 40/);
  state.files = [doc("document_auto_large", "x".repeat(AUTO_SOURCE_LIMITS.cacheCharacters + 1))];
  await assert.rejects(load("admin-A", "policy"), /No partial or truncated/);
});

test("New content-access restrictions invalidate cached text even without a changed revision", async () => {
  const { state, load } = fixture();
  await load("admin-A", "policy");
  state.files[0].contentRestricted = true;
  await assert.rejects(load("admin-A", "policy"), /restricted content access/);
  state.files[0].contentRestricted = false;
  await load("admin-A", "policy");
  assert.equal(state.reads.length, 2);
});

test("Cancellation never returns stale context or starts a provider call", async () => {
  const { load } = fixture();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(load("admin-A", "policy", { signal: controller.signal }), /abort/i);
});

test("Retrieval finds relevant text deep in long files and labels omitted context honestly", () => {
  const long = doc("deep_policy_document", "introductory content ".repeat(5000) + "SPECIALCERTIFICATE requires Security approval before publication.");
  const unrelated = doc("unrelated_document", "Other ordinary information.");
  const inventory = { files: [long, unrelated] };
  const result = automaticSourceContext([long, unrelated], inventory, "What does SPECIALCERTIFICATE require?", {});
  assert.match(result.documents[0].text, /Security approval/);
  assert.equal(result.documents[0].coverage, "excerpts");
  assert.ok(result.documents[0].providedCharacters < result.documents[0].originalCharacters);
  assert.ok(result.documents[0].providedCharacters < 9000);
});

test("Directory/context sizes are bounded and incomplete directory metadata is explicit", () => {
  const documents = Array.from({ length: 12 }, (_, i) => doc("bounded_document_" + i, "policy ".repeat(2000)));
  const files = documents.map(file => ({ ...file, path: "very long folder/".repeat(1000) }));
  const context = automaticSourceContext(documents, { files }, "policy", {});
  assert.equal(context.documents.length, AUTO_SOURCE_LIMITS.contextDocuments);
  assert.ok(JSON.stringify(context.directory).length < 25_000);
  assert.equal(context.sync.directoryComplete, false);
});

test("Connection binding changes with root, OAuth client, identity and reconnect", () => {
  const status = { connected: true, rootFolderId: "root_folder", email: "owner@example.com", connectedAt: "time1" };
  const binding = sourceConnectionBinding(status, "client1");
  for (const modified of [{ ...status, rootFolderId: "other_root" }, { ...status, email: "other@example.com" }, { ...status, connectedAt: "time2" }]) {
    assert.notEqual(binding, sourceConnectionBinding(modified, "client1"));
  }
  assert.notEqual(binding, sourceConnectionBinding(status, "client2"));
  assert.throws(() => sourceConnectionBinding({ ...status, connected: false }, "client1"));
});

test("Automatic runner uses server-resolved context without manual file selection", async () => {
  const { load } = fixture();
  let payload;
  const run = createPrivateSourceTester({ getProvider: async () => ({ id: "openai", model: "unit-test-model", apiKey: "unit-test-only-key" }),
    readSource: async () => { throw new Error("manual reader must not run"); }, loadAutomaticContext: load,
    generate: async (_provider, body) => { payload = JSON.parse(body.input[0].content);
      return { status: "completed", output_text: "Approval is required. [S1]" }; } });
  const result = await run("admin-A", request);
  assert.equal(result.mode, "automatic");
  assert.equal(result.sync.indexedDocuments, 1);
  assert.equal(payload.source_directory.length, 1);
  assert.equal(payload.source_documents[0].role, "instruction_simulation");
  assert.equal(result.published, false);
});

test("A failed automatic synchronization never reaches the AI provider", async () => {
  let generated = false;
  const run = createPrivateSourceTester({ getProvider: async () => ({ id: "openai", model: "unit-test-model", apiKey: "unit-test-only-key" }),
    loadAutomaticContext: async () => { throw new Error("Google permission check failed"); },
    generate: async () => { generated = true; } });
  await assert.rejects(run("admin-A", request), /Google permission/);
  assert.equal(generated, false);
});
