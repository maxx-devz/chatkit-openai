export const ACTIVE_CLIENT_COOKIE = "aoc_active_client";
export const ACTIVE_AGENCY_COOKIE = "aoc_active_agency";

export function workspaceError(code = "workspace_denied", message = "Choose an available workspace.", status = 403) {
  return Object.assign(new Error(message), { publicDetails: { code, message, status } });
}

export function trustedPortalHost(host, configuredOrigin = process.env.BETTER_AUTH_URL) {
  if (!host || !configuredOrigin) return false;
  try { return new URL(configuredOrigin).host === host.toLowerCase(); }
  catch { return false; }
}

function cookie(headers, name) {
  const entries = (headers.get("cookie") || "").split(";").map(part => part.trim()).filter(part => part.startsWith(name + "="));
  if (!entries.length) return null;
  if (entries.length !== 1) throw workspaceError();
  try { return decodeURIComponent(entries[0].slice(name.length + 1)); }
  catch { throw workspaceError(); }
}

export function selectedClientCookie(headers) {
  return cookie(headers, ACTIVE_CLIENT_COOKIE);
}

export function assertAgencySelectors(headers, agency) {
  const chosen = cookie(headers, ACTIVE_AGENCY_COOKIE);
  if ((chosen !== null && chosen !== agency.slug) ||
      (headers.has("x-agency-id") && headers.get("x-agency-id") !== agency.id) ||
      (headers.has("x-portal-agency") && headers.get("x-portal-agency") !== agency.slug) ||
      headers.has("x-client-id") || headers.has("x-portal-client")) throw workspaceError();
}

export function workspaceChoice(row) {
  return { id: String(row.id), slug: row.slug, name: row.display_name, role: row.role,
    agencyId: row.agency_id, agencySlug: row.agency_slug, agencyName: row.agency_name };
}

export function selectWorkspace(rows, headers, replacement) {
  const client = replacement ? replacement.slug : cookie(headers, ACTIVE_CLIENT_COOKIE);
  const agency = replacement ? replacement.agencySlug : cookie(headers, ACTIVE_AGENCY_COOKIE);
  if (replacement && (!client || !agency)) throw workspaceError();
  const matches = rows.filter(row =>
    (client == null || row.slug === client) && (agency == null || row.agency_slug === agency) &&
    [
      ["x-portal-agency", row.agency_slug], ["x-portal-client", row.slug],
      ["x-agency-id", row.agency_id], ["x-client-id", String(row.id)],
    ].every(([name, value]) => !headers.has(name) || headers.get(name) === value));
  if (!matches.length) throw workspaceError();
  if (matches.length !== 1) throw workspaceError("workspace_selection_required", "Choose a workspace to continue.", 409);
  return matches[0];
}

export function workspaceRole(role, level) {
  if (!["client_viewer", "member", "client_admin", "aoc_admin"].includes(role) || !["read", "contribute", "manage"].includes(level)) throw workspaceError();
  if (role === "client_viewer" || level === "read") return "client_viewer";
  if (role === "client_admin" && level === "manage") return "client_admin";
  if (["client_admin", "member", "aoc_admin"].includes(role) && ["manage","contribute"].includes(level)) return "member";
  throw workspaceError();
}

// URL hints must agree with explicit headers. The DAL still checks membership
// and the active cookie. An existing portal API can never acquire a new role here.
export function requestWorkspaceHeaders(url, original) {
  const headers = new Headers(original);
  for (const [parameter, header] of [["workspaceAgency","x-portal-agency"],["workspaceClient","x-portal-client"]]) {
    const values = url.searchParams.getAll(parameter);
    if (!values.length) continue;
    if (values.length !== 1 || !/^[a-z0-9][a-z0-9._-]{0,99}$/.test(values[0]) ||
      (headers.has(header) && headers.get(header) !== values[0])) throw workspaceError();
    headers.set(header, values[0]);
  }
  return headers;
}
