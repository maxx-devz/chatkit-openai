import test, { after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { databasePool } from "../../lib/database.js";
import { preparedBinding, encodePreparedDocuments, decodePreparedDocuments, findPreparedPublication, findApplicablePreparedPublications, savePreparedPublication, clearPreparedDocumentCache } from "../../lib/prepared-source-store.js";
import { loadPreparedSourceContext } from "../../lib/prepared-source-context.js";

Object.assign(process.env, { BETTER_AUTH_URL: "http://127.0.0.1:3000", GOOGLE_DRIVE_CLIENT_ID: "test.apps.googleusercontent.com",
  GOOGLE_DRIVE_CLIENT_SECRET: "unit-test-client-secret", GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: "unit-test-only-stable-prepared-key-1234567890",
  GOOGLE_DRIVE_ALLOWED_EMAIL: "test@example.com", GOOGLE_DRIVE_ROOT_FOLDER_ID: "unit_test_root_12345" });
after(async () => databasePool.end());
beforeEach(() => clearPreparedDocumentCache());

function row() {
  const value = { owner_id: "42", audience: "client:1", client_id: "1", enabled: true,
    reference_paths: ["client_folder_123"], instruction_ids: ["rules_doc_123"], additional_instructions: "Keep answers concise.",
    general_references: true, checked_at: new Date(), google_email: "test@example.com", root_folder_id: "unit_test_root_12345",
    oauth_client_id: "test.apps.googleusercontent.com", connected_at: new Date("2026-10-21T00:00:00Z"), administrator_active: true };
  value.binding = preparedBinding(value);
  value.encrypted_documents = encodePreparedDocuments("42", value.binding, [
    { id: "rules_doc_123", name: "Approved rules", path: "Company / Rules", version: "1", text: "Never invent verified settings.", folders: [] },
    { id: "knowledge_doc_123", name: "Website access", path: "Client / Access", version: "2", text: "Use delegated website access.", folders: [{ id: "client_folder_123", path: "Client" }] },
    { id: "other_client_123", name: "Other client's website", path: "Private / Other", version: "1", text: "Other client confidential website fact.", folders: [{ id: "other_folder_123", path: "Private" }] },
  ]);
  return value;
}

test("The hot path uses server-established client identity and never calls Google or any provider", async t => {
  const value = row();
  const queries = [];
  t.mock.method(databasePool, "query", async (sql, parameters) => { queries.push({ sql, parameters }); return { rows: parameters[0] === "1" ? [value] : [] }; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("No network allowed during prepared retrieval"); });
  const context = await loadPreparedSourceContext({ clientId: "1" }, "website access", "general");
  assert.match(context.instructions, /Never invent verified settings/);
  assert.match(context.instructions, /Keep answers concise/);
  assert.match(context.instructions, /Do not add internal source citations/);
  assert.doesNotMatch(context.instructions, /Source: Approved rules/);
  assert.equal(context.references.length, 1);
  assert.doesNotMatch(JSON.stringify(context.references), /Other client confidential/);
  assert.match(queries[0].sql, /WHERE p.audience='clients' OR \(p.client_id=\$1\)/);
  assert.deepEqual(queries[0].parameters, ["1"]);
  assert.deepEqual((await loadPreparedSourceContext({ clientId: "999" }, "website")).references, []);
});

test("Shared company sources reach every client and admin without a client-specific publication or Google call", async t => {
  const shared = { ...row(), audience: "clients", client_id: null };
  const queries = [];
  t.mock.method(databasePool, "query", async (sql, parameters) => { queries.push({ sql, parameters }); return { rows: [shared] }; });
  t.mock.method(globalThis, "fetch", async () => { throw new Error("Google/provider hot-path access is forbidden"); });
  for (const scope of [{ clientId: "1" }, { clientId: "999" }, { ownerId: "42" }]) {
    const result = await loadPreparedSourceContext(scope, "website", "general");
    assert.match(result.instructions, /Shared company guidance/);
    assert.match(result.instructions, /Never invent/);
    assert.equal(result.references.length, 1);
    assert.doesNotMatch(JSON.stringify(result), /Other client confidential/);
  }
  assert.deepEqual(queries.map(item => item.parameters), [["1"], ["999"], ["42"]]);
  assert.match(queries[0].sql, /p.audience='clients' OR \(p.client_id=\$1\)/);
  assert.match(queries[2].sql, /p.audience='clients' OR \(p.owner_id=\$1 AND p.audience='admin'\)/);
  await assert.rejects(findApplicablePreparedPublications({}), /authenticated/);
});

test("Shared and client-only packs combine within bounded context; pausing extras preserves shared rules", async t => {
  const shared = { ...row(), audience: "clients", client_id: null };
  let rows = [shared, row()];
  t.mock.method(databasePool, "query", async () => ({ rows }));
  const result = await loadPreparedSourceContext({ clientId: "1" }, "website");
  assert.match(result.instructions, /Shared company guidance/);
  assert.match(result.instructions, /Audience-specific guidance/);
  assert.equal(result.references.length, 1); // identical excerpts are not sent twice
  rows = [shared, { ...row(), enabled: false }];
  assert.match((await loadPreparedSourceContext({ clientId: "1" }, "website")).instructions, /Shared company guidance/);
  rows = [{ ...shared, failure_code: "access_denied" }, row()];
  await assert.rejects(loadPreparedSourceContext({ clientId: "1" }, "website"), /synchronization/);
});

test("A second administrator cannot pause or overwrite the shared publisher's pack", async t => {
  const writes = [];
  t.mock.method(databasePool, "query", async (sql, parameters) => {
    if (/^UPDATE|^INSERT/.test(sql)) writes.push(parameters);
    return { rows: /SELECT owner_id,enabled/.test(sql) ? [{ owner_id: "other-admin", enabled: true }] : [] };
  });
  await assert.rejects(savePreparedPublication("42", { action: "disable", clientId: "clients" }), /another administrator/);
  await assert.rejects(savePreparedPublication("42", { action: "save", clientId: "clients" }), /another administrator/);
  assert.equal(writes.length, 0);
});

test("Private admin publications are resolved by owner, not by the selected browser client", async t => {
  let query;
  t.mock.method(databasePool, "query", async (sql, parameters) => { query = { sql, parameters }; return { rows: [] }; });
  await findPreparedPublication({ ownerId: "42" });
  assert.match(query.sql, /p.owner_id=\$1 AND p.audience='admin'/);
  assert.deepEqual(query.parameters, ["42"]);
});

test("A disabled publication does not decrypt or load any source content", async t => {
  t.mock.method(databasePool, "query", async () => ({ rows: [{ enabled: false, encrypted_documents: "invalid" }] }));
  assert.deepEqual(await loadPreparedSourceContext({ clientId: "1" }, "website"), { instructions: "", references: [], checkedAt: null });
});

test("Revocation, inactive publisher, failed sync and stale snapshots block generation", async t => {
  let value = row();
  t.mock.method(databasePool, "query", async () => ({ rows: [value] }));
  for (const change of [{ google_email: "revoked@example.com" }, { administrator_active: false }, { failure_code: "access_denied" },
    { checked_at: new Date(Date.now() - 16 * 60_000) }, { connected_at: new Date() }]) {
    value = { ...row(), ...change };
    await assert.rejects(loadPreparedSourceContext({ clientId: "1" }, "website"));
  }
});

test("Encrypted source bodies are bound to the owner and exact connection revision", () => {
  const value = row();
  assert.equal(value.encrypted_documents.includes("Never invent"), false);
  assert.equal(decodePreparedDocuments(value).length, 3);
  for (const change of [{ owner_id: "43" }, { binding: "different-connection" }, { encrypted_documents: value.encrypted_documents + ".tamper" }]) {
    assert.throws(() => decodePreparedDocuments({ ...value, ...change }), /could not be decrypted/);
  }
});

test("Warm replies read fresh metadata, not the large blob; revision and encryption-key changes invalidate memory", async t => {
  let full = { ...row(), audience: "clients", client_id: null, sync_info: { corpusRevision: "revision-1" } };
  let reads = 0;
  t.mock.method(databasePool, "query", async query => {
    if (typeof query !== "string") { reads++; assert.equal(query.query_timeout, 45_000); return { rows: [full] }; }
    assert.doesNotMatch(query, /i\.encrypted_documents/);
    const { encrypted_documents: _ciphertext, ...metadata } = full;
    return { rows: [metadata] };
  });
  await loadPreparedSourceContext({ clientId: "1" }, "website");
  full = { ...full, checked_at: new Date() }; // unchanged corpus after a fresh Google check
  await loadPreparedSourceContext({ clientId: "2" }, "website");
  assert.equal(reads, 1);
  full = { ...full, failure_code: "access_denied" };
  await assert.rejects(loadPreparedSourceContext({ clientId: "1" }, "website"));
  assert.equal(reads, 1);
  full = { ...full, failure_code: null, sync_info: { corpusRevision: "revision-2" } };
  await loadPreparedSourceContext({ clientId: "1" }, "website");
  assert.equal(reads, 2);
  const secret = process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
  process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY = secret + "changed";
  try { await assert.rejects(loadPreparedSourceContext({ clientId: "1" }, "website"), /could not be decrypted/); }
  finally { process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY = secret; }
});
