import "server-only";
import { randomBytes } from "node:crypto";
import { OAuth2Client } from "google-auth-library";
import { databasePool } from "./database.js";
import {
  DRIVE_SCOPE, DRIVE_FOLDER, DRIVE_DOCUMENT, DRIVE_SPREADSHEET, DRIVE_DOCX, DRIVE_READABLE_TYPES, DriveSourceError, driveConfiguration, driveId,
  digestDriveValue, sealDriveValue, unsealDriveValue, assertDriveIdentity,
  discoverDriveSources, assertDriveFileScope, boundedDriveText, excludedSourceName,
} from "./drive-source-policy.js";
import { extractDriveSpreadsheet } from "./drive-spreadsheet.js";
import { extractDriveDocx } from "./drive-office.js";

const oauthClient = (config) => new OAuth2Client({ clientId: config.clientId, clientSecret: config.clientSecret,
  redirectUri: config.redirectUri, transporterOptions: { timeout: 12000, retry: false } });
const sessionBinding = (session) => digestDriveValue(String(session.session.id));
const tokenPurpose = (ownerId, config) => "refresh:" + ownerId + ":" + config.clientId + ":" + config.rootId;

function driveAuthorizationError(error) {
  if (error instanceof DriveSourceError) return error;
  const code = error?.response?.data?.error;
  if (code === "invalid_grant") return new DriveSourceError("reconnect_required", "Google no longer accepts the saved Drive authorization. It may have expired or been revoked. Click Reconnect Google Drive and approve read-only access again; the OAuth credentials in .env.local may still be correct.", 409);
  if (code === "invalid_client" || code === "unauthorized_client") return new DriveSourceError("google_client_rejected", "Google rejected this app's OAuth client. Check the configured client ID and client secret; no source content was published.", 503);
  return new DriveSourceError("google_connection_unavailable", "Google Drive access could not be verified. Check the connection again or retry later. No source content was published.", 502);
}

export async function driveConnectionStatus(ownerId, { verifyAccess = false, signal } = {}) {
  let config;
  try { config = driveConfiguration(); }
  catch (error) {
    if (error instanceof DriveSourceError) return { configured: false, connected: false, setupMessage: error.message };
    throw error;
  }
  const { rows } = await databasePool.query("SELECT google_email, root_folder_id, oauth_client_id, connected_at FROM portal_drive_source_connections WHERE owner_id=$1", [ownerId]);
  const connection = rows[0];
  const connected = Boolean(connection && connection.root_folder_id === config.rootId && connection.oauth_client_id === config.clientId && connection.google_email === config.email);
  const status = { configured: true, connected, hasAuthorization: Boolean(connection), accessVerified: false,
    state: connected ? "authorization_saved" : connection ? "configuration_changed" : "not_connected",
    allowedEmail: config.email, rootFolderId: config.rootId,
    redirectUri: config.redirectUri, email: connected ? connection.google_email : "",
    connectedAt: connected ? connection.connected_at : null, mode: "admin_private_preview" };
  // Prepared-source binding checks stay metadata-only, preserving the fast chat
  // path. Only the admin status endpoint opts into live token/folder checks.
  if (!verifyAccess || !connected) return status;
  try {
    const { client } = await connectedClient(ownerId);
    const root = await readDriveMetadata(client, config.rootId, signal);
    if (root.mimeType !== DRIVE_FOLDER || root.trashed || excludedSourceName(root.name)) throw new DriveSourceError("root_unavailable", "The configured company-knowledge folder is no longer accessible or eligible. Check folder access before reconnecting.", 403);
    return { ...status, connected: true, accessVerified: true, state: "ready", connectionMessage: "Google authorization and company-knowledge folder access verified." };
  } catch (error) {
    if (signal?.aborted) throw error;
    const failure = driveAuthorizationError(error);
    return { ...status, connected: false, state: failure.code, connectionMessage: failure.message };
  }
}

export async function beginDriveConnection(ownerId, session) {
  const config = driveConfiguration();
  const state = randomBytes(32).toString("base64url");
  const verifier = randomBytes(48).toString("base64url");
  const stateHash = digestDriveValue(state);
  await databasePool.query("DELETE FROM portal_drive_source_oauth_states WHERE expires_at < NOW() OR owner_id=$1", [ownerId]);
  await databasePool.query("INSERT INTO portal_drive_source_oauth_states(state_hash,owner_id,session_hash,encrypted_verifier,expires_at) VALUES($1,$2,$3,$4,NOW()+INTERVAL '10 minutes')", [
    stateHash, ownerId, sessionBinding(session),
    sealDriveValue(verifier, "oauth:" + stateHash, config.secret),
  ]);
  const url = oauthClient(config).generateAuthUrl({
    access_type: "offline", prompt: "consent", include_granted_scopes: false,
    scope: ["openid", "email", DRIVE_SCOPE], state, login_hint: config.email,
    code_challenge: digestDriveValue(verifier), code_challenge_method: "S256",
  });
  return { url, state, secure: config.origin.startsWith("https:") };
}

export async function finishDriveConnection(ownerId, session, state, cookieState, code) {
  const config = driveConfiguration();
  if (!/^[\w-]{43}$/.test(state || "") || state !== cookieState || !code || code.length > 4096) {
    throw new DriveSourceError("invalid_oauth_state", "Google connection expired or does not match this browser. Start Connect Google Drive again.", 403);
  }
  const stateHash = digestDriveValue(state);
  const { rows } = await databasePool.query("DELETE FROM portal_drive_source_oauth_states WHERE state_hash=$1 AND owner_id=$2 AND session_hash=$3 AND expires_at>NOW() RETURNING encrypted_verifier", [stateHash, ownerId, sessionBinding(session)]);
  if (!rows[0]) throw new DriveSourceError("invalid_oauth_state", "Google connection expired or was already used. Start again.", 403);
  const client = oauthClient(config);
  const verifier = unsealDriveValue(rows[0].encrypted_verifier, "oauth:" + stateHash, config.secret);
  const { tokens } = await client.getToken({ code, codeVerifier: verifier });
  try {
    if (!tokens.id_token || !tokens.refresh_token) throw new DriveSourceError("missing_refresh_token", "Google did not provide background access. Reconnect and grant the requested read-only permission.", 403);
    const ticket = await client.verifyIdToken({ idToken: tokens.id_token, audience: config.clientId });
    const identity = ticket.getPayload();
    assertDriveIdentity(identity, tokens.scope, config.email);
    client.setCredentials(tokens);
    const root = await readDriveMetadata(client, config.rootId);
    if (root.mimeType !== DRIVE_FOLDER || root.trashed || excludedSourceName(root.name)) throw new DriveSourceError("root_unavailable", "The configured parent must be an accessible, non-archived Drive folder.", 403);
    const encrypted = sealDriveValue(tokens.refresh_token, tokenPurpose(ownerId, config), config.secret);
    await databasePool.query("INSERT INTO portal_drive_source_connections(owner_id,google_email,google_subject,oauth_client_id,root_folder_id,encrypted_refresh_token) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(owner_id) DO UPDATE SET google_email=EXCLUDED.google_email,google_subject=EXCLUDED.google_subject,oauth_client_id=EXCLUDED.oauth_client_id,root_folder_id=EXCLUDED.root_folder_id,encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,connected_at=NOW()", [ownerId, config.email, identity.sub, config.clientId, config.rootId, encrypted]);
  } catch (error) {
    // Best effort: don't leave an unused grant behind after a rejected account.
    await client.revokeToken(tokens.refresh_token || tokens.access_token).catch(() => {});
    throw error;
  }
}

async function connectedClient(ownerId) {
  const config = driveConfiguration();
  const { rows } = await databasePool.query("SELECT * FROM portal_drive_source_connections WHERE owner_id=$1", [ownerId]);
  const row = rows[0];
  if (!row || row.oauth_client_id !== config.clientId || row.root_folder_id !== config.rootId || row.google_email !== config.email) {
    throw new DriveSourceError("not_connected", "Connect the configured Google test account first.", 409);
  }
  const client = oauthClient(config);
  let refreshToken;
  try { refreshToken = unsealDriveValue(row.encrypted_refresh_token, tokenPurpose(ownerId, config), config.secret); }
  catch { throw new DriveSourceError("drive_token_unreadable", "The saved Drive authorization cannot be read with this server's encryption configuration. Restore the original Drive encryption key or reconnect explicitly; existing sources were not changed.", 503); }
  client.setCredentials({ refresh_token: refreshToken });
  return { client, config };
}

async function driveFetch(client, url, signal) {
  // URL is constructed solely from fixed Google API origins and validated IDs.
  signal?.throwIfAborted();
  let token;
  try { token = await client.getAccessToken(); }
  catch (error) { if (signal?.aborted) throw error; throw driveAuthorizationError(error); }
  signal?.throwIfAborted();
  if (!token.token) throw new DriveSourceError("reconnect_required", "Google authorization expired. Reconnect Google Drive.", 401);
  const response = await fetch(url, { headers: { Authorization: "Bearer " + token.token }, cache: "no-store", redirect: "error", signal: AbortSignal.any([AbortSignal.timeout(12000), ...(signal ? [signal] : [])]) });
  if (!response.ok) {
    await response.body?.cancel();
    if (response.status === 401) throw new DriveSourceError("reconnect_required", "Google rejected this Drive authorization. Reconnect Google Drive and approve read-only access again.", 409);
    throw new DriveSourceError("google_request_failed", response.status === 403 || response.status === 404 ? "Google denied access to this source. Check sharing, the API configuration, or quota."
        : response.status === 429 ? "Google's request limit was reached. Wait before retrying."
          : "Google could not complete this read-only request.", response.status === 429 ? 429 : 502);
  }
  return response;
}

async function readDriveMetadata(client, id, signal) {
  const url = new URL("https://www.googleapis.com/drive/v3/files/" + driveId(id));
  url.searchParams.set("fields", "id,name,mimeType,parents,trashed,modifiedTime,version,capabilities(canDownload)");
  url.searchParams.set("supportsAllDrives", "true");
  return (await driveFetch(client, url, signal)).json();
}

export async function discoverConnectedSources(ownerId, { signal } = {}) {
  const { client, config } = await connectedClient(ownerId);
  const root = await readDriveMetadata(client, config.rootId, signal);
  if (root.mimeType !== DRIVE_FOLDER || root.trashed || excludedSourceName(root.name)) throw new DriveSourceError("root_unavailable", "The configured parent is no longer available.", 403);
  const deadline = Date.now() + 35_000;
  const inventory = await discoverDriveSources(config.rootId, async (folderId, pageToken) => {
    signal?.throwIfAborted();
    if (Date.now() > deadline) throw new DriveSourceError("inventory_timeout", "Source discovery exceeded this test's time budget; no partial inventory is reported.", 504);
    const url = new URL("https://www.googleapis.com/drive/v3/files");
    url.searchParams.set("q", "'" + driveId(folderId) + "' in parents and trashed=false");
    url.searchParams.set("fields", "nextPageToken,incompleteSearch,files(id,name,mimeType,modifiedTime,version,trashed,capabilities(canDownload))");
    url.searchParams.set("pageSize", "1000");
    url.searchParams.set("supportsAllDrives", "true");
    url.searchParams.set("includeItemsFromAllDrives", "true");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    return (await driveFetch(client, url, signal)).json();
  });
  return { ...inventory, rootName: root.name, checkedAt: new Date().toISOString(), mode: "admin_private_preview", automaticSync: false };
}

export async function previewConnectedSource(ownerId, fileId, { expectedVersion, signal } = {}) {
  driveId(fileId);
  const { client, config } = await connectedClient(ownerId);
  // Recheck current ancestry and permissions; never trust a prior browser inventory.
  const metadata = id => readDriveMetadata(client, id, signal);
  const file = await assertDriveFileScope(fileId, config.rootId, metadata);
  if (!DRIVE_READABLE_TYPES.includes(file.mimeType)) throw new DriveSourceError("unsupported_preview", "Source preparation supports Google Docs, Google Sheets, DOCX and XLSX. Other formats are listed, not silently ingested.", 415);
  if (file.capabilities?.canDownload === false) throw new DriveSourceError("source_access_restricted", "Google does not permit downloading this source.", 403);
  if (expectedVersion !== undefined && String(file.version) !== expectedVersion) throw new DriveSourceError("source_revision_changed", "A selected source changed. Discover and review its new revision before retrying.", 409);
  const native = [DRIVE_DOCUMENT, DRIVE_SPREADSHEET].includes(file.mimeType);
  const url = new URL("https://www.googleapis.com/drive/v3/files/" + driveId(fileId) + (native ? "/export" : ""));
  if (native) url.searchParams.set("mimeType", file.mimeType === DRIVE_SPREADSHEET ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" : "text/plain");
  else { url.searchParams.set("alt", "media"); url.searchParams.set("supportsAllDrives", "true"); }
  const response = await driveFetch(client, url, signal);
  const text = file.mimeType === DRIVE_DOCUMENT ? await boundedDriveText(response)
    : file.mimeType === DRIVE_DOCX ? await extractDriveDocx(response) : await extractDriveSpreadsheet(response);
  // Reject edits/moves/revocations during export rather than approving a mixed revision.
  const after = await assertDriveFileScope(fileId, config.rootId, metadata);
  if (after.capabilities?.canDownload === false || String(after.version) !== String(file.version) || after.modifiedTime !== file.modifiedTime || after.name !== file.name || after.mimeType !== file.mimeType) {
    throw new DriveSourceError("source_revision_changed", "This source changed while it was read. Discover and review its current revision before retrying.", 409);
  }
  return { id: file.id, name: file.name, text, characters: text.length, modifiedTime: file.modifiedTime, version: file.version, published: false };
}

export async function disconnectDriveSource(ownerId) {
  const config = driveConfiguration();
  const { rows } = await databasePool.query("SELECT encrypted_refresh_token,oauth_client_id,root_folder_id FROM portal_drive_source_connections WHERE owner_id=$1", [ownerId]);
  const row = rows[0];
  let revoked = false;
  if (row && row.oauth_client_id === config.clientId && row.root_folder_id === config.rootId) {
    const token = unsealDriveValue(row.encrypted_refresh_token, tokenPurpose(ownerId, config), config.secret);
    revoked = await oauthClient(config).revokeToken(token).then(() => true, () => false);
  }
  await databasePool.query("DELETE FROM portal_drive_source_connections WHERE owner_id=$1", [ownerId]);
  await databasePool.query("DELETE FROM portal_drive_source_oauth_states WHERE owner_id=$1", [ownerId]);
  return { disconnected: true, revoked, message: revoked ? "Disconnected and Google grant revoked."
    : "Disconnected locally. If Google revocation was unavailable, remove this app in your Google account permissions." };
}
