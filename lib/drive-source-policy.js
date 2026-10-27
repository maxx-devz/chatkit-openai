import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const DRIVE_CALLBACK = "/api/admin/source-connections/callback";
export const DRIVE_FOLDER = "application/vnd.google-apps.folder";
export const DRIVE_DOCUMENT = "application/vnd.google-apps.document";
export const DRIVE_SPREADSHEET = "application/vnd.google-apps.spreadsheet";
export const DRIVE_MAX_REQUESTS = 40;
export const DRIVE_MAX_FILES = 1500;
export const DRIVE_MAX_TEXT_BYTES = 1_000_000;

export class DriveSourceError extends Error {
  constructor(code, message, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function driveId(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]{10,200}$/.test(value)) {
    throw new DriveSourceError("invalid_file", "The Google Drive file identifier is invalid.");
  }
  return value;
}

export function driveConfiguration(env = process.env) {
  const required = ["GOOGLE_DRIVE_CLIENT_ID", "GOOGLE_DRIVE_CLIENT_SECRET", "GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY", "GOOGLE_DRIVE_ALLOWED_EMAIL", "GOOGLE_DRIVE_ROOT_FOLDER_ID"];
  const missing = required.filter((name) => !env[name]?.trim());
  if (missing.length) throw new DriveSourceError("setup_required", "Complete the server-only Google Drive settings first: " + missing.join(", "), 503);
  let origin;
  try {
    const url = new URL(env.BETTER_AUTH_URL);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/"
        || (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname)))) throw new Error();
    origin = url.origin;
  } catch {
    throw new DriveSourceError("setup_required", "Configure a valid HTTPS portal origin or local loopback BETTER_AUTH_URL.", 503);
  }
  const email = env.GOOGLE_DRIVE_ALLOWED_EMAIL.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY.trim().length < 32
      || !/^[A-Za-z0-9._-]+\.apps\.googleusercontent\.com$/.test(env.GOOGLE_DRIVE_CLIENT_ID.trim())) {
    throw new DriveSourceError("setup_required", "Check the Google OAuth client ID, allowed email and stable encryption key.", 503);
  }
  return {
    clientId: env.GOOGLE_DRIVE_CLIENT_ID.trim(), clientSecret: env.GOOGLE_DRIVE_CLIENT_SECRET.trim(),
    secret: env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY.trim(), email,
    rootId: driveId(env.GOOGLE_DRIVE_ROOT_FOLDER_ID.trim()), origin, redirectUri: origin + DRIVE_CALLBACK,
  };
}

export function digestDriveValue(value) { return createHash("sha256").update(value).digest("base64url"); }

export function sealDriveValue(value, purpose, secret) {
  if (!secret || secret.length < 32) throw new Error("Google Drive encryption is not configured.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
  cipher.setAAD(Buffer.from("aoc-drive:v1:" + purpose));
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}

export function unsealDriveValue(value, purpose, secret) {
  if (!secret || secret.length < 32) throw new Error("Google Drive encryption is not configured.");
  const [version, iv, tag, data, extra] = String(value).split(".");
  if (version !== "v1" || !iv || !tag || !data || extra) throw new Error("Invalid encrypted Google Drive value.");
  const cipher = createDecipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from("aoc-drive:v1:" + purpose));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8");
}

export function assertDriveIdentity(payload, grantedScopes, expectedEmail) {
  if (payload?.email_verified !== true || String(payload.email || "").toLowerCase() !== expectedEmail
      || !String(grantedScopes || "").split(/\s+/).includes(DRIVE_SCOPE)) {
    throw new DriveSourceError("wrong_google_account", "Authorize the configured test Google account and grant read-only Drive access.", 403);
  }
}

export function excludedSourceName(name) {
  return /\[(?:LEGACY|WORKSPACE|REFERENCE ONLY)\]|\barchiv(?:e|ed|es)\b|do not use|superseded/i.test(String(name));
}

export function sourceCandidate(file, atRoot = false) {
  if (file?.trashed || excludedSourceName(file?.name) || file?.mimeType === "application/vnd.google-apps.shortcut") return false;
  // Discover new SOURCE folders, but never auto-approve their contents for clients.
  return !atRoot || file?.mimeType !== DRIVE_FOLDER || /\[SOURCE\]/i.test(file.name || "");
}

export async function discoverDriveSources(rootId, readFolder) {
  const queue = [{ id: rootId, path: "", depth: 0, ancestors: [] }];
  const visited = new Set();
  const seenFiles = new Set();
  const files = [];
  let requests = 0;
  while (queue.length) {
    const folder = queue.shift();
    if (visited.has(folder.id)) continue;
    visited.add(folder.id);
    if (folder.depth > 12) throw new DriveSourceError("inventory_limit", "The folder nesting limit was reached; no complete inventory is claimed.", 413);
    let pageToken;
    do {
      if (++requests > DRIVE_MAX_REQUESTS) throw new DriveSourceError("inventory_limit", "The free-test request limit was reached; narrow the source collection before continuing.", 413);
      const page = await readFolder(folder.id, pageToken);
      if (page.incompleteSearch) throw new DriveSourceError("incomplete_inventory", "Google returned an incomplete inventory. Retry or check access; no complete inventory is claimed.", 502);
      for (const file of page.files || []) {
        if (!sourceCandidate(file, folder.depth === 0)) continue;
        const path = folder.path ? folder.path + " / " + file.name : file.name;
        if (file.mimeType === DRIVE_FOLDER) queue.push({ id: driveId(file.id), path, depth: folder.depth + 1,
          ancestors: [...folder.ancestors, { id: file.id, path }] });
        else if (!seenFiles.has(file.id)) {
          seenFiles.add(file.id);
          files.push({ id: driveId(file.id), name: file.name, path, folders: folder.ancestors, mimeType: file.mimeType,
            modifiedTime: file.modifiedTime || "", version: String(file.version || ""),
            previewSupported: [DRIVE_DOCUMENT, DRIVE_SPREADSHEET].includes(file.mimeType), contentRestricted: file.capabilities?.canDownload === false, status: "not_published" });
        }
        if (files.length + queue.length > DRIVE_MAX_FILES) throw new DriveSourceError("inventory_limit", "The free-test file limit was reached; no complete inventory is claimed.", 413);
      }
      pageToken = page.nextPageToken;
    } while (pageToken);
  }
  return { files: files.sort((a, b) => a.path.localeCompare(b.path)), requests };
}

export async function assertDriveFileScope(fileId, rootId, getMetadata) {
  let current = driveId(fileId);
  const visited = new Set();
  let target;
  for (let depth = 0; depth < 14; depth++) {
    if (visited.has(current)) break;
    visited.add(current);
    const item = await getMetadata(current);
    if (!target) target = item;
    if (item.id !== current || !sourceCandidate(item)) break;
    const parents = item.parents || [];
    if (parents.includes(rootId)) {
      if (!sourceCandidate(item, true)) break;
      const root = await getMetadata(rootId);
      if (root.id === rootId && root.mimeType === DRIVE_FOLDER && !root.trashed && !excludedSourceName(root.name)) return target;
      break;
    }
    if (parents.length !== 1) break;
    current = driveId(parents[0]);
  }
  throw new DriveSourceError("source_outside_scope", "This file is not in an accessible, eligible source folder under the configured parent.", 403);
}

export async function boundedDriveText(response, maximumBytes = DRIVE_MAX_TEXT_BYTES) {
  const reader = response.body?.getReader();
  if (!reader) throw new DriveSourceError("empty_document", "Google returned no readable document content.", 502);
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maximumBytes) {
        await reader.cancel();
        throw new DriveSourceError("document_too_large", "This document exceeds the private preview limit; it was not silently truncated.", 413);
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return Buffer.concat(chunks).toString("utf8");
}
