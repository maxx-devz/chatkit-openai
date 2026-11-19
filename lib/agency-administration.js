import "server-only";
import { databasePool } from "./database.js";
import { consoleSession, consoleError, exactKeys, text, platformError, platformResponse, consoleMutation } from "./platform-console.js";
import { normalizeApprovedWebsiteUrl } from "./client-website.js";
import { normalizeHubstaffProjectUrl } from "./hubstaff.js";
import { accountSecurityEnabled } from "./account-security-policy.js";
import { issueInvitationLink, acceptInvitationLink } from "./invitation-links.js";
export { platformError, platformResponse, consoleMutation };

// Explicit local-only rehearsal gate; it never enables /agency, /api/agency,
// client entry, provider access or any platform action.
export function assertAgencyReview() {
  let allowed = false;
  try {
    const auth = new URL(process.env.BETTER_AUTH_URL), db = new URL(process.env.DATABASE_URL);
    allowed = process.env.LOCAL_AGENCY_ADMIN_REVIEW === "true" && auth.protocol === "http:" && auth.hostname === "127.0.0.1"
      && ["postgres:", "postgresql:"].includes(db.protocol) && db.hostname === "127.0.0.1" && !db.search
      && /^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(db.pathname);
  } catch { /* Default closed. */ }
  if (!allowed) throw consoleError("agency_admin_gated", "Agency administration is not enabled.", 404);
}
function id(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,17}$/.test(value)) throw consoleError("invalid_input", "Invalid resource identifier.", 400);
  return value;
}
function uuid(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw consoleError("invalid_input", "A request identifier is required.", 400);
  return value;
}
export async function selectedAgencyAdministration(headers, slug) {
  assertAgencyReview();
  const context = await consoleSession(headers);
  const choices = (await databasePool.query("SELECT agency_platform.admin_choices($1,$2) data", [context.actor, context.session])).rows[0].data;
  if (!choices.length) throw consoleError("agency_access_required", "An active agency staff assignment is required.");
  const agency = slug ? choices.find(a => a.slug === slug) : choices.length === 1 ? choices[0] : null;
  if (slug && !agency) throw consoleError("agency_access_required", "Agency access denied.");
  if (agency && headers.has("x-aoc-agency-admin") && headers.get("x-aoc-agency-admin") !== agency.id) throw consoleError("workspace_changed", "Your agency workspace changed. Reload before continuing.", 409);
  return { ...context, choices, agency };
}
export async function agencyAdministration(headers, { agency: slug, q = "" } = {}) {
  const context = await selectedAgencyAdministration(headers, slug);
  if (!context.agency) return { choices: context.choices, selected: null };
  const data = (await databasePool.query("SELECT agency_platform.agency_admin_view($1,$2,$3,$4) data", [context.actor, context.session, context.agency.id, text(q, 100, true)])).rows[0].data;
  if (accountSecurityEnabled()) data.invitations = (await databasePool.query("SELECT agency_platform.invitation_review($1,$2,$3) data", [context.actor, context.session, context.agency.id])).rows[0].data;
  const branded=(await databasePool.query("SELECT to_regprocedure('agency_platform.public_brand(text)') IS NOT NULL ready")).rows[0]?.ready;
  const branding=branded?(await databasePool.query("SELECT agency_platform.public_brand($1) data",[context.agency.slug])).rows[0].data:null;
  return { ...data, branding:branding?{...branding,logoUrl:branding.hasLogo?`/api/portal-brand/${branding.slug}/logo?revision=${branding.revision}`:null}:null, secureInvitations: accountSecurityEnabled(), choices: context.choices, selected: context.agency.id, workspaceKey: JSON.stringify([context.actor, data.agency.id, data.actor.role, data.actor.isOwner, data.revision]) };
}
const fields = {
  "client.create": ["slug", "name"],
  "client.update": ["clientId", "name", "portalEnabled", "aiEnabled", "approvedWebsiteUrl", "hubstaffProjectUrl"],
  "client.access": ["clientId", "userId", "clientRole", "active"],
  "member.update": ["userId", "role", "active"],
  "invite.create": ["account", "role", "clientId", "clientRole"],
  "invite.revoke": ["invitationId"],
  "invite.send": ["invitationId"],
  "settings.update": ["supportName", "supportEmail", "timezone"],
  "owner.transfer": ["userId", "confirmation"],
};
export async function changeAgencyAdministration(headers, body, slug) {
  const context = await selectedAgencyAdministration(headers, slug);
  if (!context.agency) throw consoleError("selection_required", "Choose an agency first.", 409);
  if (body.action === "invite.send" && accountSecurityEnabled()) { exactKeys(body, ["action", "invitationId", "operation", "revision", "reason"]); return issueInvitationLink(context, uuid(body.invitationId)); }
  if (!Object.hasOwn(fields, body.action)) throw consoleError("invalid_input", "Unsupported agency action.", 400);
  exactKeys(body, ["action", "operation", "revision", "reason", ...fields[body.action]]);
  const command = { ...body, operation: uuid(body.operation), revision: text(body.revision, 19), reason: text(body.reason, 200) };
  if (!/^[0-9]+$/.test(command.revision) || command.reason.length < 3) throw consoleError("invalid_input", "Provide a current revision and reason.", 400);
  for (const key of ["clientId", "userId"]) if (body[key] != null && body[key] !== "") command[key] = id(body[key]);
  for (const key of ["active", "portalEnabled", "aiEnabled"]) if (key in command && typeof command[key] !== "boolean") throw consoleError("invalid_input", "Invalid access setting.", 400);
  for (const [key, max] of [["slug", 50], ["name", 120], ["role", 20], ["clientRole", 20], ["account", 200], ["confirmation", 80], ["timezone", 100]]) if (key in command) command[key] = text(command[key], max);
  if (body.action === "client.create" && !/^[a-z0-9][a-z0-9._-]{2,49}$/.test(command.slug)) throw consoleError("invalid_input", "Use a valid lowercase client slug.", 400);
  if (body.action === "client.update") {
    try { command.approvedWebsiteUrl = normalizeApprovedWebsiteUrl(text(body.approvedWebsiteUrl || "", 500, true)); command.hubstaffProjectUrl = normalizeHubstaffProjectUrl(text(body.hubstaffProjectUrl || "", 500, true)); }
    catch { throw consoleError("invalid_input", "Use a public HTTPS website and a valid Hubstaff project URL.", 400); }
  }
  if (body.action === "settings.update") {
    command.supportName = text(body.supportName, 120, true); command.supportEmail = text(body.supportEmail, 200, true);
    if (command.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(command.supportEmail)) throw consoleError("invalid_input", "Enter a valid support email.", 400);
  }
  if (body.action === "invite.revoke") command.invitationId = uuid(body.invitationId);
  if (body.action === "invite.create" && body.role !== "client_user") { if (body.clientId || body.clientRole) throw consoleError("invalid_input", "Staff invitations do not carry a client role.", 400); delete command.clientId; delete command.clientRole; }
  const result = (await databasePool.query("SELECT agency_platform.agency_admin_change($1,$2,$3,$4::jsonb) data", [context.actor, context.session, context.agency.id, JSON.stringify(command)])).rows[0].data;
  if (body.action === "invite.create" && accountSecurityEnabled()) {
    try { await issueInvitationLink(context, command.operation); result.mailCaptured = true; }
    catch { result.mailCaptured = false; } // The existing pending invite remains; an authorized administrator can resend.
  }
  return result;
}
export async function myAgencyInvitations(headers) {
  assertAgencyReview(); const context = await consoleSession(headers);
  return (await databasePool.query("SELECT agency_platform.agency_my_invitations($1,$2) data", [context.actor, context.session])).rows[0].data;
}
export async function acceptAgencyInvitation(headers, body, agencySlug) {
  assertAgencyReview(); const context = await consoleSession(headers);
  exactKeys(body, accountSecurityEnabled() ? ["id", "token"] : ["id"]);
  if (accountSecurityEnabled()) { await acceptInvitationLink(context, uuid(body.id), body.token, agencySlug); return { accepted: true }; }
  await databasePool.query("SELECT agency_platform.agency_accept_invitation($1,$2,$3)", [context.actor, context.session, uuid(body.id)]);
  return { accepted: true };
}
