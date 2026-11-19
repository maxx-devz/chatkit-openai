import "server-only";
import { auth, isPortalAuthConfigured } from "./auth.js";
import { databasePool } from "./database.js";
import { trustedPortalHost, workspaceError } from "./workspace-selection.js";
import { assertTrustedOrigin, readJsonRequest } from "./request-security.js";

import { assertAccountSession } from "./account-security-policy.js";

const privateHeaders = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
export function consoleError(code, message, status = 403) { return workspaceError(code, message, status); }
export async function consoleSession(headers) {
  if (!trustedPortalHost(headers.get("host"))) throw consoleError("unknown_workspace_host", "Unknown portal host.");
  if (!isPortalAuthConfigured()) throw consoleError("setup_required", "Portal authentication needs setup.", 503);
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session?.user?.id || !session.session?.id) throw consoleError("authentication_required", "Sign in to continue.", 401);
  await assertAccountSession(databasePool, session.user.id, session.session.id);
  return { actor: session.user.id, session: session.session.id };
}
export async function requirePlatform(headers, write = false) {
  const context = await consoleSession(headers);
  const { rows } = await databasePool.query("SELECT * FROM agency_platform.console_actor($1,$2,$3)", [context.actor, context.session, write]);
  const row = rows[0];
  if (!row) throw consoleError("platform_access_required", "Platform staff access required.");
  return { ...context, admin: { id: String(row.user_id), role: row.role, name: row.name }, canManage: row.role === "owner" };
}
export async function platformDirectory(headers, options = {}) {
  const context = await requirePlatform(headers);
  const query = text(options.q || "", 100, true), filter = options.status || "all", page = Number(options.page || 0);
  if (!["all", "active", "suspended"].includes(filter) || !Number.isInteger(page) || page < 0 || page > 100000) throw consoleError("invalid_filter", "Invalid directory filter.", 400);
  const args = [context.actor, context.session];
  const directory = (await databasePool.query("SELECT agency_platform.console_directory($1,$2,$3,$4,$5) data", [...args, query, filter, page])).rows[0].data;
  const ids = directory.agencies.map(a => a.id);
  const costs = (await databasePool.query("SELECT agency_platform.console_costs($1,$2,$3::bigint[]) data", [...args, ids])).rows[0].data;
  const audit = (await databasePool.query("SELECT agency_platform.console_audit($1,$2) data", args)).rows[0].data;
  const targets = (await databasePool.query("SELECT agency_platform.console_support_targets($1,$2) data", args)).rows[0].data;
  const requests = (await databasePool.query("SELECT agency_platform.support_requests_list($1,$2) data", args)).rows[0].data;
  return { ...directory, agencies: directory.agencies.map(a => ({ ...a, costs: costs[a.id] || null, subscription: "Not configured" })), audit, targets, requests, admin: context.admin, canManage: context.canManage };
}
export function text(value, maximum, blank = false) {
  if (typeof value !== "string" || (!blank && !value.trim()) || value.trim().length > maximum || /[\x00-\x1f\x7f<>]/.test(value)) throw consoleError("invalid_input", "Check the submitted fields.", 400);
  return value.trim();
}
export function exactKeys(body, keys) {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key))) throw consoleError("invalid_input", "Unsupported request fields.", 400);
}
function uuid(value) {
  if (typeof value !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value)) throw consoleError("invalid_input", "A request identifier is required.", 400);
  return value;
}
function id(value) {
  if (typeof value !== "string" || !/^[1-9][0-9]{0,17}$/.test(value)) throw consoleError("invalid_input", "Invalid resource identifier.", 400);
  return value;
}
export async function platformChange(headers, body) {
  const context = await requirePlatform(headers, true);
  const create = body.action === "create";
  exactKeys(body, create ? ["action", "operation", "reason", "slug", "name", "ownerAccount"] : ["action", "operation", "reason", "agencyId", "confirmation", "version"]);
  const command = { action: body.action, operation: uuid(body.operation), reason: text(body.reason, 200) };
  if (command.reason.length < 3 || !["create", "suspend", "reactivate"].includes(body.action)) throw consoleError("invalid_input", "Provide a valid action and reason.", 400);
  if (create) {
    Object.assign(command, { slug: text(body.slug, 80), name: text(body.name, 160), ownerAccount: text(body.ownerAccount, 200) });
    if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(command.slug)) throw consoleError("invalid_input", "Use 2–80 lowercase letters, numbers, underscores or hyphens for the slug.", 400);
  } else {
    Object.assign(command, { agencyId: id(body.agencyId), confirmation: text(body.confirmation, 80), version: text(body.version, 20) });
    if (!/^[0-9]{1,19}$/.test(command.version)) throw consoleError("invalid_input", "Invalid state version.", 400);
  }
  return (await databasePool.query("SELECT agency_platform.console_change($1,$2,$3::jsonb) data", [context.actor, context.session, JSON.stringify(command)])).rows[0].data;
}
export async function supportList(headers) {
  const c = await consoleSession(headers);
  return (await databasePool.query("SELECT agency_platform.support_requests_list($1,$2) data", [c.actor, c.session])).rows[0].data;
}
export async function supportChange(headers, body) {
  const c = await consoleSession(headers);
  if (body.action === "request") {
    exactKeys(body, ["action", "operation", "clientId", "reason", "ticket"]);
    const reason = text(body.reason, 200); if (reason.length < 3) throw consoleError("invalid_input", "Provide a support reason.", 400);
    const result = await databasePool.query("SELECT agency_platform.support_request($1,$2,$3,$4,$5,$6) id", [c.actor, c.session, id(body.clientId), reason, text(body.ticket, 100), uuid(body.operation)]);
    return { id: result.rows[0].id };
  }
  if (body.action === "check") {
    exactKeys(body, ["action", "id"]);
    // Session and explicit platform assignment are rechecked in this transaction.
    const db = await databasePool.connect();
    try {
      await db.query("BEGIN");
      await db.query("SELECT * FROM agency_platform.console_actor($1,$2,false)", [c.actor, c.session]);
      const rows = (await db.query("SELECT agency_platform.support_requests_list($1,$2) data", [c.actor, c.session])).rows[0].data;
      const r = rows.find(r => r.id === uuid(body.id) && r.isRequester);
      if (!r) throw consoleError("support_denied", "An active support approval is required.");
      const status = (await db.query("SELECT agency_platform.support_workspace_status($1,$2,$3,$4) data", [c.actor, r.id, r.agencyId, r.clientId])).rows[0].data;
      await db.query("COMMIT"); // Persist denied-use audit too.
      if (!status) throw consoleError("support_denied", "An active support approval is required.");
      return { status };
    } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
    finally { db.release(); }
  }
  exactKeys(body, ["action", "id", "capacity"]);
  if (!["approve", "deny", "revoke"].includes(body.action) || !["agency", "client"].includes(body.capacity)) throw consoleError("invalid_input", "Invalid support decision.", 400);
  await databasePool.query("SELECT agency_platform.support_decide($1,$2,$3,$4,$5)", [c.actor, c.session, uuid(body.id), body.capacity, body.action]);
  return { saved: true };
}
export async function aocDelivery(headers, body) {
  const c = await consoleSession(headers);
  if (body) {
    exactKeys(body, ["clientId", "portalEnabled", "aiEnabled"]);
    if (typeof body.portalEnabled !== "boolean" || typeof body.aiEnabled !== "boolean") throw consoleError("invalid_input", "Select portal and AI access.", 400);
    await databasePool.query("SELECT agency_platform.aoc_delivery_update($1,$2,$3,$4,$5)", [c.actor, c.session, id(body.clientId), body.portalEnabled, body.aiEnabled]);
  }
  const clients = (await databasePool.query("SELECT * FROM agency_platform.aoc_delivery($1,$2)", [c.actor, c.session])).rows.map(r => ({ id: String(r.id), slug: r.slug, name: r.name, portalEnabled: r.portal_enabled, aiEnabled: r.ai_enabled, hubstaffProjectUrl: r.hubstaff_project_url || "" }));
  return { clients };
}
export function platformResponse(data, status = 200) { return Response.json(data, { status, headers: privateHeaders }); }
export function platformError(error) {
  const known = error?.publicDetails;
  const code = error?.code;
  const status = known?.status || error?.status || (code === "42501" ? 403 : code === "23505" || code === "40001" ? 409 : ["22023", "22P02", "23514"].includes(code) ? 400 : ["42883", "42P01"].includes(code) ? 503 : 500);
  return platformResponse({ code: known?.code || (status === 403 ? "access_denied" : status === 409 ? "state_conflict" : status === 503 ? "setup_required" : "request_failed"), error: known?.message || (status === 403 ? "Access denied." : status === 409 ? "The record or request has changed. Refresh before retrying." : status === 400 ? "Check the submitted fields." : "The console is temporarily unavailable.") }, status);
}
export async function consoleMutation(request, handler) {
  try { assertTrustedOrigin(request.headers); return platformResponse(await handler(request.headers, await readJsonRequest(request, 8_000))); }
  catch (error) { return platformError(error); }
}
