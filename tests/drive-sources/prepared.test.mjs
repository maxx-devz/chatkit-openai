import test, { after } from "node:test";
import assert from "node:assert/strict";
import { databasePool } from "../../lib/database.js";
import { preparedBinding, encodePreparedDocuments, decodePreparedDocuments, findPreparedPublication } from "../../lib/prepared-source-store.js";
import { loadPreparedSourceContext } from "../../lib/prepared-source-context.js";

Object.assign(process.env, { BETTER_AUTH_URL: "http://127.0.0.1:3000", GOOGLE_DRIVE_CLIENT_ID: "test.apps.googleusercontent.com",
  GOOGLE_DRIVE_CLIENT_SECRET: "unit-test-client-secret", GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: "unit-test-only-stable-prepared-key-1234567890",
  GOOGLE_DRIVE_ALLOWED_EMAIL: "test@example.com", GOOGLE_DRIVE_ROOT_FOLDER_ID: "unit_test_root_12345" });
after(async () => databasePool.end());

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
  assert.equal(context.references.length, 1);
  assert.doesNotMatch(JSON.stringify(context.references), /Other client confidential/);
  assert.match(queries[0].sql, /WHERE p.client_id=\$1/);
  assert.deepEqual(queries[0].parameters, ["1"]);
  assert.deepEqual((await loadPreparedSourceContext({ clientId: "999" }, "website")).references, []);
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
