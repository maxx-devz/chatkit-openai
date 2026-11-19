import { access, mkdir, writeFile } from "node:fs/promises";
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";
import { createAgencyReviewFixture } from "./agency-review-fixture.mjs";
async function main() {
  const [flag, name, ...rest] = process.argv.slice(2);
  const runtime = new URL(process.env.DATABASE_URL), operator = new URL(approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, name));
  if (flag !== "--confirm-database" || rest.length || !/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(name) || runtime.hostname !== "127.0.0.1" || operator.hostname !== "127.0.0.1" || runtime.search || operator.search || runtime.host !== operator.host || runtime.pathname !== operator.pathname || runtime.username === operator.username || !["http://127.0.0.1:3000", "http://127.0.0.1:3001"].includes(process.env.BETTER_AUTH_URL) || (process.env.BETTER_AUTH_SECRET || "").length < 32) throw Error("Require the approved synthetic loopback profile.");
  const directory = new URL("../.tmp/agency-admin-review/", import.meta.url), output = new URL("accounts.json", directory);
  if (await access(output).then(() => true, () => false)) throw Error("Preserve the existing private agency account file.");
  process.env.DATABASE_URL = operator.href;
  const { databasePool } = await import("../lib/postgres.js");
  const { createPortalAuth, closeAuthDatabase } = await import("../lib/auth.js");
  let db;
  try {
    db = await databasePool.connect();
    if (!(await db.query("SELECT 1 FROM agency_platform.schema_migrations WHERE version='009_agency_administration'")).rowCount) throw Error("Migrate Stage 13 first.");
    const fixture = await createAgencyReviewFixture(db, createPortalAuth({ allowAccountCreation: true, useNextCookies: false, operatorDatabase: true }), process.env.BETTER_AUTH_URL);
    await mkdir(directory, { recursive: true }); await writeFile(output, JSON.stringify(fixture, null, 2), { mode: 0o600, flag: "wx" });
    console.log("Synthetic agency accounts saved privately in .tmp/agency-admin-review/accounts.json. No invitations sent or existing users promoted.");
  } finally { db?.release(); await closeAuthDatabase(); }
}
main().catch(error => { console.error("Agency review seed stopped", safeDatabaseCode(error)); process.exitCode = 1; });
