// A membership grants access only within its own client workspace.
// AOC administrator records are evaluated separately in portal_admins.
export const CLIENT_PERMISSIONS = Object.freeze({
  OVERVIEW_READ: "client.overview.read",
  DOCUMENTS_READ: "client.documents.read",
  DOCUMENTS_CONTRIBUTE: "client.documents.contribute",
  DOCUMENTS_MANAGE: "client.documents.manage",
  AI_USE: "client.ai.use",
  MEMBERS_MANAGE: "client.members.manage",
  ACCESS_AUDIT_READ: "client.access_audit.read",
});

const viewer = [CLIENT_PERMISSIONS.OVERVIEW_READ, CLIENT_PERMISSIONS.DOCUMENTS_READ];
const member = [...viewer, CLIENT_PERMISSIONS.DOCUMENTS_CONTRIBUTE, CLIENT_PERMISSIONS.AI_USE];
const administrator = [...member, CLIENT_PERMISSIONS.DOCUMENTS_MANAGE,
  CLIENT_PERMISSIONS.MEMBERS_MANAGE, CLIENT_PERMISSIONS.ACCESS_AUDIT_READ];

const permissionsByRole = Object.freeze({
  client_viewer: Object.freeze(viewer),
  member: Object.freeze(member),
  client_admin: Object.freeze(administrator),
  // Legacy membership data is not an AOC-wide administrator grant.
  aoc_admin: Object.freeze(member),
});

export function clientPermissionsForRole(role) {
  return permissionsByRole[role] || [];
}

export function hasClientPermission(role, permission) {
  return clientPermissionsForRole(role).includes(permission);
}

export function isOrdinaryClientRole(role) {
  return role === "client_viewer" || role === "member";
}
