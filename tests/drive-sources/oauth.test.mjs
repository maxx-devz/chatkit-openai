import test, { after } from "node:test";
import assert from "node:assert/strict";
import { OAuth2Client } from "google-auth-library";
import { databasePool } from "../../lib/database.js";
import { beginDriveConnection, finishDriveConnection, driveConnectionStatus, discoverConnectedSources, previewConnectedSource } from "../../lib/drive-source-service.js";
import { digestDriveValue, sealDriveValue, unsealDriveValue, DRIVE_SCOPE, DRIVE_FOLDER } from "../../lib/drive-source-policy.js";

const secret = "unit-test-only-drive-key-1234567890123456789";
const rootId = "unit_test_root_12345";
const ownerId = "123";
const state = "x".repeat(43);
const session = { session: { id: "unit-test-session-1" } };
const clientId = "unit-test.apps.googleusercontent.com";
const email = "jaymark@alwaysopencommerce.co";
Object.assign(process.env, { BETTER_AUTH_URL: "http://127.0.0.1:3000", GOOGLE_DRIVE_CLIENT_ID: clientId,
  GOOGLE_DRIVE_CLIENT_SECRET: "unit-test-client-secret", GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: secret,
  GOOGLE_DRIVE_ALLOWED_EMAIL: email, GOOGLE_DRIVE_ROOT_FOLDER_ID: rootId });

after(async () => { await databasePool.end(); });

test("OAuth challenge is encrypted, admin/session bound and uses PKCE/read-only consent", async (t) => {
  const queries = [];
  t.mock.method(databasePool, "query", async (sql, values) => { queries.push({ sql, values }); return { rows: [] }; });
  const connection = await beginDriveConnection(ownerId, session);
  const url = new URL(connection.url);
  assert.equal(url.origin, "https://accounts.google.com");
  assert.equal(url.searchParams.get("redirect_uri"), "http://127.0.0.1:3000/api/admin/source-connections/callback");
  assert.equal(url.searchParams.get("login_hint"), email);
  assert.equal(url.searchParams.get("access_type"), "offline");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.equal(url.searchParams.get("scope").split(" ").includes(DRIVE_SCOPE), true);
  assert.equal(url.searchParams.get("scope").includes("drive.file"), false);
  const insert = queries.find((q) => q.sql.startsWith("INSERT"));
  assert.equal(insert.values[1], ownerId);
  assert.equal(insert.values[2], digestDriveValue(session.session.id));
  const verifier = unsealDriveValue(insert.values[3], "oauth:" + insert.values[0], secret);
  assert.equal(url.searchParams.get("code_challenge"), digestDriveValue(verifier));
  assert.equal(connection.state, url.searchParams.get("state"));
});

test("Forged/missing browser state never reaches database or token exchange", async (t) => {
  const query = t.mock.method(databasePool, "query", async () => { throw new Error("must not query"); });
  const exchange = t.mock.method(OAuth2Client.prototype, "getToken", async () => { throw new Error("must not exchange"); });
  for (const cookie of [undefined, "other-browser"]) await assert.rejects(finishDriveConnection(ownerId, session, state, cookie, "fake-code"), /does not match/);
  assert.equal(query.mock.callCount(), 0);
  assert.equal(exchange.mock.callCount(), 0);
});

test("Expired/replayed/different-session challenge is rejected before OAuth exchange", async (t) => {
  let query;
  t.mock.method(databasePool, "query", async (sql, values) => { query = { sql, values }; return { rows: [] }; });
  const exchange = t.mock.method(OAuth2Client.prototype, "getToken", async () => { throw new Error("must not exchange"); });
  await assert.rejects(finishDriveConnection(ownerId, session, state, state, "fake-code"), /expired or was already used/);
  assert.match(query.sql, /DELETE.*session_hash=.*expires_at>NOW\(\).*RETURNING/);
  assert.equal(query.values[1], ownerId);
  assert.equal(query.values[2], digestDriveValue(session.session.id));
  assert.equal(exchange.mock.callCount(), 0);
});

function mockExchange(t, identity = { sub: "test-google-sub", email, email_verified: true }, scopes = DRIVE_SCOPE) {
  t.mock.method(OAuth2Client.prototype, "getToken", async () => ({ tokens: { id_token: "mock-jwt-not-real", refresh_token: "mock-refresh-token", scope: scopes } }));
  const verify = t.mock.method(OAuth2Client.prototype, "verifyIdToken", async () => ({ getPayload: () => identity }));
  t.mock.method(OAuth2Client.prototype, "getAccessToken", async () => ({ token: "mock-access-token" }));
  const revoke = t.mock.method(OAuth2Client.prototype, "revokeToken", async () => ({}));
  return { verify, revoke };
}

test("Successful mocked exchange verifies identity and encrypts only the refresh token", async (t) => {
  const queries = [];
  t.mock.method(databasePool, "query", async (sql, values) => {
    queries.push({ sql, values });
    return { rows: sql.startsWith("DELETE") ? [{ encrypted_verifier: sealDriveValue("test-verifier", "oauth:" + digestDriveValue(state), secret) }] : [] };
  });
  const { verify } = mockExchange(t);
  t.mock.method(globalThis, "fetch", async (url, options) => {
    assert.equal(new URL(url).origin, "https://www.googleapis.com");
    assert.equal(options.redirect, "error");
    return Response.json({ id: rootId, name: "Company Knowledge", mimeType: DRIVE_FOLDER });
  });
  await finishDriveConnection(ownerId, session, state, state, "fake-code");
  assert.equal(verify.mock.calls[0].arguments[0].audience, clientId);
  const insert = queries.find((q) => q.sql.startsWith("INSERT"));
  assert.equal(insert.values[0], ownerId);
  assert.equal(insert.values[1], email);
  assert.equal(insert.values[5].includes("mock-refresh-token"), false);
  assert.equal(unsealDriveValue(insert.values[5], "refresh:" + ownerId + ":" + clientId + ":" + rootId, secret), "mock-refresh-token");
  assert.equal(JSON.stringify(insert.values).includes("mock-access-token"), false);
});

test("Wrong account/denied scope is never persisted and its unused grant is revoked", async (t) => {
  const queries = [];
  t.mock.method(databasePool, "query", async (sql) => {
    queries.push(sql);
    return { rows: [{ encrypted_verifier: sealDriveValue("test-verifier", "oauth:" + digestDriveValue(state), secret) }] };
  });
  const { revoke } = mockExchange(t, { sub: "outsider", email: "other@example.com", email_verified: true });
  await assert.rejects(finishDriveConnection(ownerId, session, state, state, "fake-code"), /configured test Google account/);
  assert.equal(queries.some((sql) => sql.startsWith("INSERT")), false);
  assert.equal(revoke.mock.callCount(), 1);
});

test("Connection status is owner-scoped and never returns encrypted token material", async (t) => {
  t.mock.method(databasePool, "query", async (sql, values) => {
    assert.deepEqual(values, [ownerId]);
    assert.match(sql, /WHERE owner_id=\$1/);
    return { rows: [{ google_email: email, root_folder_id: rootId, oauth_client_id: clientId,
      connected_at: "2026-10-21", encrypted_refresh_token: "must-not-be-returned" }] };
  });
  const status = await driveConnectionStatus(ownerId);
  assert.equal(status.connected, true);
  assert.equal(JSON.stringify(status).includes("must-not-be-returned"), false);
});

test("Changed root/client/account requires explicit reconnection before any Google read", async (t) => {
  t.mock.method(databasePool, "query", async () => ({ rows: [{ google_email: email, root_folder_id: "different_root", oauth_client_id: clientId }] }));
  const network = t.mock.method(globalThis, "fetch", async () => { throw new Error("must not fetch"); });
  await assert.rejects(discoverConnectedSources(ownerId), /Connect the configured Google test account/);
  assert.equal(network.mock.callCount(), 0);
});

function documentReads(t, { changedAfterExport = false } = {}) {
  let exports = 0;
  t.mock.method(databasePool, "query", async () => ({ rows: [{ google_email: email, root_folder_id: rootId,
    oauth_client_id: clientId, encrypted_refresh_token: sealDriveValue("mock-refresh", "refresh:" + ownerId + ":" + clientId + ":" + rootId, secret) }] }));
  t.mock.method(OAuth2Client.prototype, "getAccessToken", async () => ({ token: "mock-access-token" }));
  t.mock.method(globalThis, "fetch", async url => {
    const parsed = new URL(url);
    if (parsed.pathname.endsWith("/export")) { exports++; return new Response("Private test document."); }
    if (parsed.pathname.endsWith(rootId)) return Response.json({ id: rootId, name: "Company Knowledge", mimeType: DRIVE_FOLDER });
    return Response.json({ id: "test_document_123", name: "Private source", parents: [rootId],
      mimeType: "application/vnd.google-apps.document", version: changedAfterExport && exports ? "43" : "42",
      modifiedTime: "2026-10-21T01:00:00Z" });
  });
  return () => exports;
}

test("Pinned private source read verifies the revision before and after export", async t => {
  const exports = documentReads(t);
  const preview = await previewConnectedSource(ownerId, "test_document_123", { expectedVersion: "42" });
  assert.equal(preview.text, "Private test document.");
  assert.equal(preview.version, "42");
  assert.equal(preview.published, false);
  assert.equal(exports(), 1);
});

test("Stale selected revision never exports source text", async t => {
  const exports = documentReads(t);
  await assert.rejects(previewConnectedSource(ownerId, "test_document_123", { expectedVersion: "41" }), /source changed/);
  assert.equal(exports(), 0);
});

test("A document edited during export is rejected rather than returned as reviewed", async t => {
  documentReads(t, { changedAfterExport: true });
  await assert.rejects(previewConnectedSource(ownerId, "test_document_123", { expectedVersion: "42" }), /changed while it was read/);
});

test("Cancelled source read never exports or requests a Google access token", async t => {
  documentReads(t);
  const getToken = t.mock.method(OAuth2Client.prototype, "getAccessToken", async () => { throw new Error("must not refresh"); });
  const controller = new AbortController(); controller.abort();
  await assert.rejects(previewConnectedSource(ownerId, "test_document_123", { expectedVersion: "42", signal: controller.signal }), /abort/i);
  assert.equal(getToken.mock.callCount(), 0);
});
