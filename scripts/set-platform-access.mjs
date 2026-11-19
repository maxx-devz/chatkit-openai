// Operator-only: no browser self-promotion and no account/default-password creation.
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";
async function main() {
  const args = process.argv.slice(2);
  if (args.length !== 10 || args[0] !== "--confirm-database" || args[2] !== "--account-id" || args[4] !== "--role" || args[6] !== "--active" || args[8] !== "--reason") throw Error("Supply --confirm-database, --account-id, --role owner|operator, --active true|false and --reason.");
  const [, database, , external, , role, , active, , reason] = args;
  if (!external || external.length > 200 || !["owner", "operator"].includes(role) || !["true", "false"].includes(active) || reason.trim().length < 3 || reason.length > 200 || /[\x00-\x1f<>]/.test(reason)) throw Error("Invalid assignment.");
  // Explicit operator process only. Select its private connection before the
  // canonical provisioning pool is imported; never change a runtime process.
  process.env.DATABASE_URL = approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, database);
  const { databasePool, closeDatabasePool } = await import("../lib/postgres.js");
  let db;
  try {
    db = await databasePool.connect(); await db.query("BEGIN");
    const users = await db.query("SELECT u.id FROM portal_users u WHERE u.external_id=$1 AND NOT EXISTS(SELECT 1 FROM portal_internal_users i WHERE i.user_id=u.id) FOR SHARE", [external]);
    if (users.rowCount !== 1) throw Error("Approved non-Internal account not found.");
    await db.query("SET LOCAL ROLE aoc_agency_owner");
    await db.query(`INSERT INTO agency_platform.platform_memberships(user_id,role,is_active,assignment_reason) VALUES($1,$2,$3,$4)
      ON CONFLICT(user_id) DO UPDATE SET role=EXCLUDED.role,is_active=EXCLUDED.is_active,assignment_reason=EXCLUDED.assignment_reason`, [users.rows[0].id, role, active === "true", reason.trim()]);
    await db.query("COMMIT"); console.log("Explicit platform assignment saved and audited.");
  } catch (error) { await db?.query("ROLLBACK").catch(() => {}); throw error; }
  finally { db?.release(); await closeDatabasePool(); }
}
main().catch(error => { console.error("Platform assignment stopped", safeDatabaseCode(error)); process.exitCode = 1; });
