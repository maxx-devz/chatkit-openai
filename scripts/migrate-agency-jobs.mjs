import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";

async function main() {
  const [confirm, database, roleFlag, role, ...rest] = process.argv.slice(2);
  if (confirm !== "--confirm-database" || roleFlag !== "--app-role" || rest.length || !/^[a-z][a-z0-9_]{1,62}$/.test(role || "")) {
    throw Error("Supply the verified migration database and its Stage 04 application LOGIN.");
  }
  const url = approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, database);
  const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  const version = "007_background_jobs";
  const sql = await readFile(new URL("../database/agency-platform/007_background_jobs.sql", import.meta.url), "utf8");
  const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
  try {
    await db.connect();
    await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("SELECT pg_advisory_xact_lock(734901,8)");
    const login = await db.query(`SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolcanlogin AND current_database()=$2
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT pg_has_role(oid,'aoc_agency_owner','MEMBER')
      AND has_function_privilege(oid,'agency_platform.legacy_aoc_clients(bigint[])','EXECUTE')`, [role,database]);
    if (!login.rowCount) throw Error("Incorrect target or role.");
    await db.query('GRANT SELECT ON public."session" TO aoc_agency_owner');
    const internal = await db.query("SELECT to_regclass('public.portal_internal_users') AS found");
    if(internal.rows[0].found) await db.query("GRANT SELECT ON public.portal_internal_users TO aoc_agency_owner");
    // PostgreSQL row-lock privileges require UPDATE on at least one column.
    // Only the non-login dedicated owner receives these key-column grants.
    await db.query('GRANT UPDATE(id) ON public.portal_clients,public.portal_users,public.portal_website_insights_sites,public."session" TO aoc_agency_owner');
    await db.query("GRANT UPDATE(user_id) ON public.portal_memberships,public.portal_admins TO aoc_agency_owner");
    await db.query("GRANT UPDATE(owner_id) ON public.portal_drive_source_connections TO aoc_agency_owner");
    await db.query("SET LOCAL ROLE aoc_agency_owner");
    const existing = await db.query("SELECT checksum FROM agency_platform.schema_migrations WHERE version=$1", [version]);
    if (!existing.rowCount) {
      await db.query(sql);
      await db.query("INSERT INTO agency_platform.schema_migrations(version,checksum) VALUES($1,$2)", [version,checksum]);
    } else if (existing.rows[0].checksum !== checksum) throw Error("Applied migration differs.");
    await db.query(`GRANT EXECUTE ON FUNCTION agency_platform.job_scope(text,text,text,text,bigint),
      agency_platform.claim_job(text,text,text,text,bigint,uuid,boolean),agency_platform.check_job(text,text,uuid,text,text,bigint),
      agency_platform.finish_job(text,text,uuid,text),agency_platform.retry_job(text,text,text,text,bigint),
      agency_platform.job_candidates(text,integer) TO "${role}"`);
    await db.query("COMMIT");
    console.log("Stage 10 context schema verified.");
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { await db.end(); }
}
main().catch(error => { console.error("Stage 10 migration stopped", safeDatabaseCode(error)); process.exitCode=1; });
