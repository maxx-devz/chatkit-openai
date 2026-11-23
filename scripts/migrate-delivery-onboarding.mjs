import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";

async function main() {
  const [confirm, database, roleFlag, role, ...rest] = process.argv.slice(2);
  if (confirm !== "--confirm-database" || roleFlag !== "--app-role" || rest.length || !/^[a-z][a-z0-9_]{1,62}$/.test(role || "")) throw Error("Supply the verified operator database and ordinary runtime LOGIN.");
  const url = approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, database);
  const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  const version = "014_delivery_onboarding";
  const sql = await readFile(new URL("../database/agency-platform/014_delivery_onboarding.sql", import.meta.url), "utf8");
  const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
  try {
    await db.connect(); await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("SELECT pg_advisory_xact_lock(734901,161)");
    const login = await db.query(`SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolcanlogin AND current_database()=$2
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT pg_has_role(oid,'aoc_agency_owner','MEMBER')
      AND has_function_privilege(oid,'agency_platform.job_scope(text,text,text,text,bigint)','EXECUTE')`, [role, database]);
    if (!login.rowCount) throw Error("Incorrect target or runtime role.");
    const ready = await db.query("SELECT 1 FROM agency_platform.schema_migrations WHERE version='013_client_business'");
    if (!ready.rowCount) throw Error("Stage 16 migration is required.");
    await db.query("SET LOCAL ROLE aoc_agency_owner");
    const existing = await db.query("SELECT checksum FROM agency_platform.schema_migrations WHERE version=$1", [version]);
    if (!existing.rowCount) {
      await db.query(sql);
      await db.query("INSERT INTO agency_platform.schema_migrations(version,checksum) VALUES($1,$2)", [version, checksum]);
    } else if (existing.rows[0].checksum !== checksum) throw Error("Applied migration differs.");
    await db.query(`GRANT EXECUTE ON FUNCTION agency_platform.onboarding_view(text,text,uuid),agency_platform.onboarding_progress(text,text,jsonb),agency_platform.onboarding_admin_view(text,text,bigint),agency_platform.onboarding_admin_change(text,text,bigint,jsonb) TO "${role}"`);
    await db.query("COMMIT");
    console.log("Stage 16A delivery onboarding verified; no membership, assignment or history changed.");
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
  finally { await db.end(); }
}
main().catch(error => { console.error("Stage 16A migration stopped", safeDatabaseCode(error)); process.exitCode = 1; });
