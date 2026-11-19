import { randomUUID } from "node:crypto";
import { mkdir, writeFile, realpath, lstat } from "node:fs/promises";
import path from "node:path";
import { brandPath,reportIdentity } from "./agency-branding-policy.js";
import { databasePool } from "./postgres.js";
import { runtimeDatabasePool } from "./runtime-database-role.js";

// Deliberately no live transport. Capture is available only for a disposable
// loopback DB, a loopback portal, and reserved synthetic recipient addresses.
export async function captureAuthMail({ recipient, kind, token, invitationId, agencySlug }) {
  const origin = new URL(process.env.BETTER_AUTH_URL), db = new URL(process.env.DATABASE_URL);
  const root = path.resolve(process.cwd(), ".tmp"), directory = path.resolve(process.env.AUTH_TEST_MAIL_DIR || "");
  if (process.env.AUTH_MAIL_MODE !== "capture" || origin.protocol !== "http:" || origin.hostname !== "127.0.0.1"
    || db.hostname !== "127.0.0.1" || !/^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(db.pathname)
    || !/^[^@\s]+@[^@\s]+\.invalid$/i.test(recipient) || !directory.startsWith(root + path.sep)
    || !["reset", "verify", "invitation"].includes(kind)) throw Error("Private test email setup required.");
  await mkdir(directory, { recursive: true });
  // Refuse junction/symlink escapes from the ignored capture directory.
  if ((await lstat(root)).isSymbolicLink() || (await lstat(directory)).isSymbolicLink() || !(await realpath(directory)).startsWith((await realpath(root)) + path.sep)) throw Error("Unsafe capture directory.");
  const fragment = new URLSearchParams({ token, ...(invitationId ? { id: invitationId } : {}) });
  let identity=null;
  if(agencySlug){
    brandPath(agencySlug,kind);
    const ready=(await runtimeDatabasePool(databasePool).query("SELECT to_regprocedure('agency_platform.public_brand(text)') IS NOT NULL ready")).rows[0]?.ready;
    if(!ready)throw Error("Brand callback setup required.");
    const brand=(await runtimeDatabasePool(databasePool).query("SELECT agency_platform.public_brand($1) data",[agencySlug])).rows[0].data;
    if(!brand)throw Error("Brand callback unavailable.");identity=reportIdentity(brand);
  }
  const link = origin.origin + (agencySlug?brandPath(agencySlug,kind):"/account/" + kind) + "#" + fragment;
  await writeFile(path.join(directory, randomUUID() + ".json"), JSON.stringify({ kind, recipient, link, identity, createdAt: new Date().toISOString() }, null, 2), { flag: "wx", mode: 0o600 });
}
