// New synthetic accounts only, in an already migrated disposable local database.
import { randomBytes } from "node:crypto";
import { access, mkdir, writeFile } from "node:fs/promises";
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";
async function main() {
  const [flag, name, ...rest] = process.argv.slice(2);
  const runtime = new URL(process.env.DATABASE_URL), operator = new URL(approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, name));
  if (flag !== "--confirm-database" || rest.length || !/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(name) || runtime.hostname !== "127.0.0.1" || operator.hostname !== "127.0.0.1" || runtime.search || operator.search || !["postgres:", "postgresql:"].includes(runtime.protocol) || !["postgres:", "postgresql:"].includes(operator.protocol) || runtime.host !== operator.host || runtime.pathname !== operator.pathname || runtime.username === operator.username || process.env.BETTER_AUTH_URL !== "http://127.0.0.1:3000" || (process.env.BETTER_AUTH_SECRET || "").length < 32) throw Error("Require matching disposable loopback database, separate roles and private loopback auth configuration.");
  const directory = new URL("../.tmp/platform-review/", import.meta.url), credentials = new URL("accounts.json", directory);
  if (await access(credentials).then(() => true, () => false)) throw Error("Private review accounts already exist; preserve them before creating another fixture.");
  // Explicit operator provisioning, through the same canonical Node pool as
  // existing create-admin. The review server separately uses the ordinary URL.
  process.env.DATABASE_URL = operator.href;
  const { databasePool } = await import("../lib/postgres.js");
  const { createPortalAuth, closeAuthDatabase } = await import("../lib/auth.js");
  let db;
  const created = {};
  try {
    db = await databasePool.connect();
    if (!(await db.query("SELECT 1 FROM agency_platform.schema_migrations WHERE version='008_platform_console'")).rowCount) throw Error("Migrate Stage 12 first.");
    const auth = createPortalAuth({ allowAccountCreation: true, useNextCookies: false, operatorDatabase: true });
    for (const kind of ["owner", "agencyContact"]) {
      const username = "local." + kind.toLowerCase() + "." + randomBytes(6).toString("hex"), password = randomBytes(24).toString("hex");
      const signed = await auth.api.signUpEmail({ body: { username, password, name: "Synthetic review " + kind, email: username + "@example.invalid" } });
      await db.query("BEGIN"); await db.query("SELECT pg_advisory_xact_lock(734901,120)");
      const user = await db.query("INSERT INTO portal_users(id,external_id,display_name) SELECT coalesce(max(id),0)+1,$1,$2 FROM portal_users RETURNING id", [signed.user.id, "Synthetic review " + kind]);
      if (kind === "owner") {
        await db.query("SET LOCAL ROLE aoc_agency_owner");
        await db.query("INSERT INTO agency_platform.platform_memberships(user_id,role,assignment_reason) VALUES($1,'owner','New synthetic local review account only')", [user.rows[0].id]);
      }
      await db.query("COMMIT");
      created[kind] = { username, password, accountIdentifier: signed.user.id };
    }
    await mkdir(directory, { recursive: true });
    await writeFile(credentials, JSON.stringify(created, null, 2), { mode: 0o600, flag: "wx" });
    console.log("New synthetic accounts saved privately in .tmp/platform-review/accounts.json. No existing administrator promoted.");
  } catch (error) { await db?.query("ROLLBACK").catch(() => {}); throw error; }
  finally { db?.release(); await closeAuthDatabase(); }
}
main().catch(error => { console.error("Local review seed stopped", safeDatabaseCode(error)); process.exitCode = 1; });
