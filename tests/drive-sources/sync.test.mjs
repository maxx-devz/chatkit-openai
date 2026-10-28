import test, { after } from "node:test";
import assert from "node:assert/strict";
import { OAuth2Client } from "google-auth-library";
import { databasePool } from "../../lib/database.js";
import { preparedBinding, encodePreparedDocuments } from "../../lib/prepared-source-store.js";
import { synchronizePreparedSources } from "../../lib/prepared-source-sync.js";
import { prepareSourceDocuments } from "../../lib/prepared-source-sync-policy.js";

Object.assign(process.env, { BETTER_AUTH_URL: "http://127.0.0.1:3000", GOOGLE_DRIVE_CLIENT_ID: "test.apps.googleusercontent.com",
  GOOGLE_DRIVE_CLIENT_SECRET: "synthetic-client-secret", GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: "synthetic-drive-secret-1234567890123456789",
  GOOGLE_DRIVE_ALLOWED_EMAIL: "test@example.com", GOOGLE_DRIVE_ROOT_FOLDER_ID: "synthetic_root_123" });
after(async () => databasePool.end());

test("Sync allows bounded large writes, but unchanged corpora update only metadata", async t => {
  const connected = new Date("2026-10-28T00:00:00Z");
  const connection = { google_email: "test@example.com", root_folder_id: "synthetic_root_123", oauth_client_id: "test.apps.googleusercontent.com", connected_at: connected, administrator_active: true };
  const binding = preparedBinding(connection);
  const document = { id: "synthetic_doc_123", name: "Company guide", path: "Company guide", folders: [], version: "1", modifiedTime: "2026-10-28", text: "Verified company services.", previewSupported: true };
  const prepared = await prepareSourceDocuments({ rootName: "Company Knowledge", files: [document] }, [document], () => { throw new Error("must reuse"); });
  let revision;
  const writes = [];
  t.mock.method(databasePool, "query", async query => {
    const sql = typeof query === "string" ? query : query.text;
    if (/SELECT google_email/.test(sql)) return { rows: [connection] };
    if (/SELECT \*/.test(sql)) return { rows: [{ ...connection, encrypted_refresh_token: "unused" }] };
    if (/INSERT INTO portal_prepared/.test(sql)) {
      assert.equal(query.query_timeout, 45_000);
      return { rows: [{ owner_id: "7", binding,
        encrypted_documents: encodePreparedDocuments("7", binding, [document]), sync_info: { corpusRevision: revision } }] };
    }
    if (/UPDATE portal_prepared/.test(sql)) { writes.push(query); return { rows: [{ owner_id: "7" }] }; }
    throw new Error("Unexpected SQL");
  });
  // connectedClient decrypts its token before making a read. Supply a valid sealed fixture.
  const { sealDriveValue } = await import("../../lib/drive-source-policy.js");
  const mockQuery = databasePool.query;
  t.mock.method(databasePool, "query", async (...args) => {
    const result = await mockQuery(...args);
    for (const row of result.rows) if (row.encrypted_refresh_token === "unused") {
      row.encrypted_refresh_token = sealDriveValue("synthetic-refresh", "refresh:7:test.apps.googleusercontent.com:synthetic_root_123", process.env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY);
    }
    return result;
  });
  t.mock.method(OAuth2Client.prototype, "getAccessToken", async () => ({ token: "synthetic-access" }));
  t.mock.method(globalThis, "fetch", async value => {
    const url = new URL(value);
    if (url.pathname.endsWith("/synthetic_root_123")) return Response.json({ id: "synthetic_root_123", name: "Company Knowledge", mimeType: "application/vnd.google-apps.folder" });
    assert.equal(url.pathname, "/drive/v3/files");
    return Response.json({ files: [{ ...document, mimeType: "application/vnd.google-apps.document" }] });
  });
  assert.equal((await synchronizePreparedSources("7")).ready, true);
  assert.equal(writes[0].query_timeout, 45_000);
  assert.equal(typeof writes[0].values[3], "string");
  revision = prepared.sync.corpusRevision;
  assert.equal((await synchronizePreparedSources("7")).ready, true);
  assert.equal(writes[1].values[3], null);
  assert.match(writes[1].text, /COALESCE\(\$4,encrypted_documents\)/);
});
