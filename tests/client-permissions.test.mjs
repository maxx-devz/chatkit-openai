import assert from "node:assert/strict";
import test from "node:test";

import { CLIENT_PERMISSIONS, clientPermissionsForRole, hasClientPermission,
  isOrdinaryClientRole } from "../lib/client-permissions.js";

test("Viewer is read-only and cannot use AI or manage members", () => {
  assert.equal(hasClientPermission("client_viewer", CLIENT_PERMISSIONS.OVERVIEW_READ), true);
  assert.equal(hasClientPermission("client_viewer", CLIENT_PERMISSIONS.DOCUMENTS_READ), true);
  assert.equal(hasClientPermission("client_viewer", CLIENT_PERMISSIONS.AI_USE), false);
  assert.equal(hasClientPermission("client_viewer", CLIENT_PERMISSIONS.DOCUMENTS_CONTRIBUTE), false);
  assert.equal(hasClientPermission("client_viewer", CLIENT_PERMISSIONS.MEMBERS_MANAGE), false);
});

test("Member can work but cannot manage client access", () => {
  assert.equal(hasClientPermission("member", CLIENT_PERMISSIONS.AI_USE), true);
  assert.equal(hasClientPermission("member", CLIENT_PERMISSIONS.DOCUMENTS_CONTRIBUTE), true);
  assert.equal(hasClientPermission("member", CLIENT_PERMISSIONS.MEMBERS_MANAGE), false);
  assert.equal(hasClientPermission("member", CLIENT_PERMISSIONS.DOCUMENTS_MANAGE), false);
});

test("Client Administrator receives client access management only", () => {
  assert.equal(hasClientPermission("client_admin", CLIENT_PERMISSIONS.MEMBERS_MANAGE), true);
  assert.equal(hasClientPermission("client_admin", CLIENT_PERMISSIONS.ACCESS_AUDIT_READ), true);
  assert.equal(hasClientPermission("client_admin", "aoc.clients.create"), false);
  assert.equal(hasClientPermission("client_admin", "aoc.ai.configure"), false);
});

test("Unknown or AOC-only roles never create client permissions", () => {
  assert.deepEqual(clientPermissionsForRole("aoc_owner"), []);
  assert.deepEqual(clientPermissionsForRole("internal_admin"), []);
  assert.equal(hasClientPermission("aoc_admin", CLIENT_PERMISSIONS.MEMBERS_MANAGE), false);
  assert.equal(isOrdinaryClientRole("client_admin"), false);
  assert.equal(isOrdinaryClientRole("member"), true);
});
