import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { databasePool as db } from "../database.js";
import { sealDriveValue, unsealDriveValue } from "../drive-source-policy.js";
import { googleConfig, SEARCH_SCOPE, InsightError, propertyCoversWebsite } from "./policy.js";
import { getWebsite } from "./store.js";
import { boundedJson, readSearchData } from "./google-data.js";

const digest = value => createHash("sha256").update(String(value)).digest("base64url");
const binding = context => digest(context.session.session.id);
const purpose = (context, id, config) => `website-insights:${context.client.id}:${id}:${config.clientId}`;
const oauth = config => new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret,
  redirectUri: config.redirectUri, transporterOptions: { timeout: 10000, retry: false } });
export async function googleStatus(context, id) {
  await getWebsite(context, id);
  let config;
  try { config = googleConfig(); }
  catch (error) { return { configured: false, connected: false, hasAuthorization: false, accessVerified: false, state: "not_configured", message: error.message, properties: [] }; }
  const [saved, pending] = await Promise.all([
    db.query("SELECT property,oauth_client_id,connected_at FROM portal_website_insights_google WHERE website_id=$1 AND client_id=$2", [id, context.client.id]),
    db.query("SELECT 1 FROM portal_website_insights_oauth_states WHERE website_id=$1 AND client_id=$2 AND user_id=$3 AND session_hash=$4 AND expires_at>NOW() LIMIT 1", [id, context.client.id, context.user.id, binding(context)]),
  ]);
  const row = saved.rows[0];
  const status = { configured: true, connected: false, hasAuthorization: Boolean(row), accessVerified: false,
    property: null, connectedAt: row?.connected_at || null, properties: [] };
  // A new account-switch attempt must not look successful merely because an
  // earlier refresh token is still saved. Scope pending state to this login.
  if (pending.rows.length) return { ...status, state: "sign_in_incomplete", message: "Google sign-in was started, but completion has not been confirmed. Retry sign-in. Any earlier saved authorization has not been replaced." };
  if (!row) return { ...status, state: "not_connected", message: "Connect Google with read-only Search Console access to get started." };
  if (row.oauth_client_id !== config.clientId) return { ...status, state: "reconnect_required", message: "The OAuth client changed. Reconnect Google before using this saved authorization." };
  try {
    const properties = await googleProperties(context, id);
    if (!properties.length) return { ...status, accessVerified: true, state: "no_matching_property", message: "Google authorization was verified, but this account has no accessible Search Console property matching this website." };
    const property = properties.some(item => item.siteUrl === row.property) ? row.property : null;
    return { ...status, accessVerified: true, properties, property, connected: Boolean(property),
      state: property ? "ready" : "property_required", message: property ? "Search Console access verified for the selected property." : "Search Console access verified. Choose a matching property to finish setup." };
  } catch (error) {
    return { ...status, state: error instanceof InsightError ? error.code : "google_unavailable",
      message: error instanceof InsightError ? error.message : "Search Console access could not be verified. Check access again; no connection was confirmed." };
  }
}
export async function beginGoogle(context, id) {
  await getWebsite(context, id);
  const config = googleConfig(), state = randomBytes(32).toString("base64url"), verifier = randomBytes(48).toString("base64url");
  await db.query("DELETE FROM portal_website_insights_oauth_states WHERE expires_at<NOW() OR (client_id=$1 AND user_id=$2)", [context.client.id, context.user.id]);
  await db.query(`INSERT INTO portal_website_insights_oauth_states(state_hash,website_id,client_id,user_id,session_hash,encrypted_verifier,expires_at)
    VALUES($1,$2,$3,$4,$5,$6,NOW()+INTERVAL '10 minutes')`, [digest(state), id, context.client.id, context.user.id, binding(context),
    sealDriveValue(verifier, "website-oauth:" + digest(state), config.secret)]);
  return { state, secure: config.origin.startsWith("https:"), url: oauth(config).generateAuthUrl({
    access_type: "offline", prompt: "consent", include_granted_scopes: false, scope: [SEARCH_SCOPE],
    state, code_challenge: digest(verifier), code_challenge_method: "S256",
  }) };
}
async function consumeGoogleState(context, state, cookie) {
  if (!/^[\w-]{43}$/.test(state || "") || cookie !== state) {
    throw new InsightError("oauth_state", "The Google connection expired or does not match this browser.", 403);
  }
  const { rows } = await db.query(`DELETE FROM portal_website_insights_oauth_states WHERE state_hash=$1 AND client_id=$2 AND user_id=$3 AND session_hash=$4
    AND expires_at>NOW() RETURNING website_id,encrypted_verifier`, [digest(state), context.client.id, context.user.id, binding(context)]);
  if (!rows[0]) throw new InsightError("oauth_state", "The connection was already used, expired, or belongs to another session.", 403);
  return rows[0];
}
export async function cancelGoogle(context, state, cookie) {
  const row = await consumeGoogleState(context, state, cookie);
  await getWebsite(context, row.website_id);
  return row.website_id;
}
export async function finishGoogle(context, state, cookie, code) {
  const config = googleConfig();
  if (typeof code !== "string" || !code || code.length > 4096) throw new InsightError("oauth_state", "Google sign-in did not return a valid authorization code.", 403);
  const row = await consumeGoogleState(context, state, cookie);
  const id = row.website_id;
  await getWebsite(context, id);
  const client = oauth(config);
  const { tokens } = await client.getToken({ code, codeVerifier: unsealDriveValue(row.encrypted_verifier, "website-oauth:" + digest(state), config.secret) });
  if (!tokens.refresh_token || !String(tokens.scope || "").split(/\s+/).includes(SEARCH_SCOPE)) {
    throw new InsightError("oauth_scope", "Google did not grant read-only offline Search Console access. Reconnect and approve that scope.", 403);
  }
  await db.query(`INSERT INTO portal_website_insights_google(website_id,client_id,connected_by,oauth_client_id,encrypted_refresh_token)
    VALUES($1,$2,$3,$4,$5) ON CONFLICT(website_id) DO UPDATE SET connected_by=$3,oauth_client_id=$4,encrypted_refresh_token=$5,property=NULL,connected_at=NOW()`,
    [id, context.client.id, context.user.id, config.clientId, sealDriveValue(tokens.refresh_token, purpose(context, id, config), config.secret)]);
  return id;
}
async function googleApi(context, id) {
  const config = googleConfig();
  const { rows } = await db.query("SELECT encrypted_refresh_token,oauth_client_id,property FROM portal_website_insights_google WHERE website_id=$1 AND client_id=$2", [id, context.client.id]);
  const row = rows[0];
  if (!row || row.oauth_client_id !== config.clientId) throw new InsightError("google_disconnected", "Connect Search Console for this website first.", 409);
  const client = oauth(config);
  client.setCredentials({ refresh_token: unsealDriveValue(row.encrypted_refresh_token, purpose(context, id, config), config.secret) });
  const access = await client.getAccessToken().catch(() => { throw new InsightError("google_reconnect", "Reconnect Google Search Console; its authorization could not be refreshed.", 409); });
  if (!access.token) throw new InsightError("google_reconnect", "Reconnect Google Search Console.", 409);
  const api = async (url, body, signal) => {
    // Endpoints are generated by this module, never supplied by browsers or pages.
    const response = await fetch(url, { method: body ? "POST" : "GET", redirect: "error", cache: "no-store",
      headers: { Authorization: `Bearer ${access.token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.any([AbortSignal.timeout(8000), ...(signal ? [signal] : [])]) });
    if (!response.ok) {
      const payload = await boundedJson(response, 100_000).catch(() => ({}));
      const reasons = [...(payload.error?.errors || []), ...(payload.error?.details || [])].map(item => item.reason);
      if (reasons.includes("SERVICE_DISABLED") || reasons.includes("accessNotConfigured")) {
        throw new InsightError("api_disabled", "Search Console API is disabled for this OAuth app. Enable Google Search Console API in its Google Cloud project, then check access again.", 409);
      }
      if (response.status === 401 || reasons.includes("ACCESS_TOKEN_SCOPE_INSUFFICIENT") || reasons.includes("insufficientPermissions")) {
        throw new InsightError("reconnect_required", "Saved Google authorization is expired or lacks Search Console read access. Reconnect Google and approve the read-only permission.", 409);
      }
      throw new InsightError("google_access", response.status === 429 ? "Google Search Console quota reached. Try again later."
        : "Google denied this read. Check Search Console property access, API enablement, OAuth consent and connection status.", 409);
    }
    return boundedJson(response, 2_000_000);
  };
  return { api, property: row.property };
}
export async function googleProperties(context, id) {
  const site = await getWebsite(context, id), { api } = await googleApi(context, id);
  const data = await api("https://www.googleapis.com/webmasters/v3/sites");
  return (data.siteEntry || []).filter(entry => entry.permissionLevel !== "siteUnverifiedUser" && propertyCoversWebsite(entry.siteUrl, site.url))
    .map(entry => ({ siteUrl: entry.siteUrl, permission: entry.permissionLevel }));
}
export async function selectGoogleProperty(context, id, property) {
  const properties = await googleProperties(context, id);
  if (!properties.some(entry => entry.siteUrl === property)) throw new InsightError("property_access", "Choose an accessible Search Console property matching this website.", 403);
  await db.query("UPDATE portal_website_insights_google SET property=$3 WHERE website_id=$1 AND client_id=$2", [id, context.client.id, property]);
}
export async function disconnectGoogle(context, id) {
  await getWebsite(context, id);
  // Do not revoke an entire Google grant: the same OAuth client can also be
  // used by another website or the existing Drive integration. Remove only
  // this website's stored access. Google-level revocation remains user-owned.
  await db.query("DELETE FROM portal_website_insights_google WHERE website_id=$1 AND client_id=$2", [id, context.client.id]);
  await db.query("DELETE FROM portal_website_insights_oauth_states WHERE website_id=$1 AND client_id=$2", [id, context.client.id]);
}
export async function websiteSearchData(context, id, url, signal) {
  try {
    await getWebsite(context, id);
    const { api, property } = await googleApi(context, id);
    if (!property) return { status: "property_required", message: "Verify Search Console access and choose a matching property, then analyze again." };
    return { ...await readSearchData(api, property, url, signal), property };
  } catch (error) {
    if (signal?.aborted) throw error;
    return { status: "unavailable", message: error instanceof InsightError ? error.message : "Search Console data could not be read. Reconnect or retry later." };
  }
}
