import test from "node:test";
import assert from "node:assert/strict";
import {
  DRIVE_SCOPE, DRIVE_FOLDER, DRIVE_DOCUMENT, DRIVE_CALLBACK,
  driveConfiguration, driveId, sealDriveValue, unsealDriveValue,
  assertDriveIdentity, sourceCandidate, discoverDriveSources, assertDriveFileScope, boundedDriveText,
} from "../lib/drive-source-policy.js";

const secret = "unit-test-only-stable-drive-key-123456789";
const rootId = "root_folder_12345";
const env = { GOOGLE_DRIVE_CLIENT_ID: "123-test.apps.googleusercontent.com", GOOGLE_DRIVE_CLIENT_SECRET: "unit-test-client-secret",
  GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: secret, GOOGLE_DRIVE_ALLOWED_EMAIL: "jaymark@alwaysopencommerce.co",
  GOOGLE_DRIVE_ROOT_FOLDER_ID: rootId, BETTER_AUTH_URL: "http://127.0.0.1:3000" };
const folder = (id, name, parents = [rootId]) => ({ id, name, parents, mimeType: DRIVE_FOLDER });
const doc = (id, name, parents = [rootId]) => ({ id, name, parents, mimeType: DRIVE_DOCUMENT });

test("Drive setup requires real server configuration; callbacks use only configured origin", () => {
  const config = driveConfiguration(env);
  assert.equal(config.redirectUri, "http://127.0.0.1:3000" + DRIVE_CALLBACK);
  assert.equal(config.email, "jaymark@alwaysopencommerce.co");
  assert.throws(() => driveConfiguration({ ...env, GOOGLE_DRIVE_CLIENT_SECRET: "" }), /server-only/);
  assert.throws(() => driveConfiguration({ ...env, GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY: "short" }));
  for (const origin of ["http://public.example", "https://user:pass@example.com", "https://example.com/other", "https://example.com/?injected=1"]) {
    assert.throws(() => driveConfiguration({ ...env, BETTER_AUTH_URL: origin }));
  }
  assert.equal(driveConfiguration({ ...env, BETTER_AUTH_URL: "https://portal.example" }).origin, "https://portal.example");
});

test("Drive identifiers cannot inject paths or query filters", () => {
  assert.equal(driveId(rootId), rootId);
  for (const value of [undefined, "../outside", "abc' or trashed=false", "https://evil.example", "a".repeat(201)]) assert.throws(() => driveId(value));
});

test("Drive secrets are encrypted with random IVs and purpose binding", () => {
  const value = sealDriveValue("unit-test-refresh-token", "refresh:admin1:client1:root1", secret);
  assert.equal(unsealDriveValue(value, "refresh:admin1:client1:root1", secret), "unit-test-refresh-token");
  assert.equal(value.includes("unit-test-refresh-token"), false);
  assert.notEqual(value, sealDriveValue("unit-test-refresh-token", "refresh:admin1:client1:root1", secret));
  for (const purpose of ["refresh:admin2:client1:root1", "oauth:challenge", "refresh:admin1:other:root1"]) {
    assert.throws(() => unsealDriveValue(value, purpose, secret));
  }
  assert.throws(() => unsealDriveValue(value, "refresh:admin1:client1:root1", secret + "wrong"));
  assert.throws(() => unsealDriveValue(value + ".tamper", "refresh:admin1:client1:root1", secret));
  assert.throws(() => sealDriveValue("x", "test", "short"));
});

test("Only verified configured Google email with exact read-only scope is accepted", () => {
  const identity = { email: env.GOOGLE_DRIVE_ALLOWED_EMAIL, email_verified: true };
  assert.doesNotThrow(() => assertDriveIdentity(identity, "openid email " + DRIVE_SCOPE, env.GOOGLE_DRIVE_ALLOWED_EMAIL));
  assert.throws(() => assertDriveIdentity({ ...identity, email: "other@example.com" }, DRIVE_SCOPE, env.GOOGLE_DRIVE_ALLOWED_EMAIL));
  assert.throws(() => assertDriveIdentity({ ...identity, email_verified: false }, DRIVE_SCOPE, env.GOOGLE_DRIVE_ALLOWED_EMAIL));
  assert.throws(() => assertDriveIdentity(identity, DRIVE_SCOPE + "-evil", env.GOOGLE_DRIVE_ALLOWED_EMAIL));
  assert.throws(() => assertDriveIdentity(identity, "openid email", env.GOOGLE_DRIVE_ALLOWED_EMAIL));
});

test("Source discovery does not treat archives/workspaces/shortcuts as sources", () => {
  assert.equal(sourceCandidate(folder("source_folder_1", "01 - [SOURCE] Identity"), true), true);
  for (const name of ["Archived Do not use", "90 - [LEGACY] old", "07 - [WORKSPACE] Generated", "06 - [REFERENCE ONLY] Templates", "[SOURCE] Superseded"]) {
    assert.equal(sourceCandidate(folder("excluded_folder_1", name), true), false);
  }
  assert.equal(sourceCandidate(folder("unapproved_folder_1", "Unmarked new folder"), true), false);
  assert.equal(sourceCandidate(doc("document_id_1", "Overview"), true), true);
  assert.equal(sourceCandidate({ mimeType: "application/vnd.google-apps.shortcut", name: "[SOURCE] Shortcut" }), false);
  assert.equal(sourceCandidate({ ...doc("document_id_1", "Active"), trashed: true }), false);
});

test("Inventory discovers new eligible nested files, follows pages and does not publish", async () => {
  const calls = [];
  const result = await discoverDriveSources(rootId, async (id, token) => {
    calls.push([id, token]);
    if (id === rootId) return { files: [folder("source_folder_1", "01 - [SOURCE] Identity"), folder("archive_folder_1", "Archived Do not use"), doc("root_document_1", "START HERE")] };
    if (!token) return { files: [doc("new_document_1", "New source"), folder("nested_folder_1", "Nested sources")], nextPageToken: "google-opaque-page-token" };
    return { files: [doc("new_document_2", "Another source")] };
  });
  // The injected listing returns the same nested folder; loop protection prevents repeat traversal.
  assert.equal(result.files.some((f) => f.id === "new_document_1"), true);
  assert.equal(result.files.every((f) => f.status === "not_published"), true);
  assert.equal(new Set(result.files.map((f) => f.id)).size, result.files.length);
  assert.equal(calls.some(([id]) => id === "archive_folder_1"), false);
  assert.equal(calls.some(([, token]) => token === "google-opaque-page-token"), true);
});

test("Incomplete and over-budget inventories fail rather than report success", async () => {
  await assert.rejects(discoverDriveSources(rootId, async () => ({ incompleteSearch: true })), /incomplete inventory/);
  await assert.rejects(discoverDriveSources(rootId, async () => ({ files: [], nextPageToken: "endless" })), /request limit/);
});

test("Preview revalidates ancestry, allows eligible descendants and rejects outsiders", async () => {
  const metadata = {
    [rootId]: folder(rootId, "Company Knowledge", []),
    source_folder_1: folder("source_folder_1", "01 - [SOURCE] Identity"),
    nested_folder_1: folder("nested_folder_1", "Nested", ["source_folder_1"]),
    document_id_1: doc("document_id_1", "Brand", ["nested_folder_1"]),
    outside_file_1: doc("outside_file_1", "Unrelated", []),
    archived_folder: folder("archived_folder", "Archived Do not use"),
    archived_file_1: doc("archived_file_1", "Old policy", ["archived_folder"]),
    unmarked_folder: folder("unmarked_folder", "Private unmarked folder"),
    unmarked_file_1: doc("unmarked_file_1", "Not eligible", ["unmarked_folder"]),
  };
  const read = async (id) => metadata[id];
  assert.equal((await assertDriveFileScope("document_id_1", rootId, read)).name, "Brand");
  for (const id of ["outside_file_1", "archived_file_1", "unmarked_file_1"]) await assert.rejects(assertDriveFileScope(id, rootId, read), /not in an accessible/);
  metadata.document_id_1.parents = [];
  await assert.rejects(assertDriveFileScope("document_id_1", rootId, read), /not in an accessible/);
});

test("Preview rejects ancestry cycles and deleted documents", async () => {
  const file = doc("document_id_1", "Deleted", [rootId]);
  file.trashed = true;
  await assert.rejects(assertDriveFileScope(file.id, rootId, async () => file));
  await assert.rejects(assertDriveFileScope("cycle_folder_1", rootId, async (id) => folder(id, "Cycle", [id])));
});

test("Bounded document reading preserves text and rejects excess bytes without truncation", async () => {
  assert.equal(await boundedDriveText(new Response("Approved source text"), 100), "Approved source text");
  await assert.rejects(boundedDriveText(new Response("too much source text"), 4), /not silently truncated/);
  await assert.rejects(boundedDriveText(new Response(null)), /no readable/);
});
