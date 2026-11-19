import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";

async function main() {
  const [confirm, database, roleFlag, role, ...rest] = process.argv.slice(2);
  if (confirm !== "--confirm-database" || roleFlag !== "--app-role" || rest.length || !/^[a-z][a-z0-9_]{1,62}$/.test(role || "")) throw Error("Supply the verified operator database and ordinary runtime LOGIN.");
  const url = approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, database);
  const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  const version = "011_account_security";
  const sql = await readFile(new URL("../database/agency-platform/011_account_security.sql", import.meta.url), "utf8");
  const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
  try {
    await db.connect(); await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("SELECT pg_advisory_xact_lock(734901,14)");
    const login = await db.query(`SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolcanlogin AND current_database()=$2
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT pg_has_role(oid,'aoc_agency_owner','MEMBER')
      AND has_function_privilege(oid,'agency_platform.job_scope(text,text,text,text,bigint)','EXECUTE')`, [role, database]);
    if (!login.rowCount) throw Error("Incorrect target or runtime role.");
    const ready = await db.query("SELECT 1 FROM agency_platform.schema_migrations WHERE version='010_specialist_assignments'");
    if (!ready.rowCount) throw Error("Stage 13A migration is required.");
    await db.query('GRANT SELECT, REFERENCES ON public."user",public."session" TO aoc_agency_owner');
    await db.query('GRANT UPDATE(id) ON public."user",public."session" TO aoc_agency_owner');
    if (!(await db.query("SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user' AND column_name='twoFactorEnabled'")).rowCount) throw Error("Run the supported Better Auth migration with PORTAL_ACCOUNT_SECURITY_ENABLED=true first.");
    await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON public."twoFactor" TO "${role}"`);
    await db.query("SET LOCAL ROLE aoc_agency_owner");
    const existing = await db.query("SELECT checksum FROM agency_platform.schema_migrations WHERE version=$1", [version]);
    if (!existing.rowCount) {
      await db.query(sql);
      await db.query("INSERT INTO agency_platform.schema_migrations(version,checksum) VALUES($1,$2)", [version, checksum]);
    } else if (existing.rows[0].checksum !== checksum) throw Error("Applied migration differs.");
    await db.query(`REVOKE ALL ON FUNCTION agency_platform.accept_invitation_internal(text,text,uuid) FROM "${role}"`);
    await db.query(`GRANT EXECUTE ON FUNCTION agency_platform.account_status(text,text),agency_platform.account_session(text,text),
      agency_platform.record_session_factor(text,text),agency_platform.issue_invitation_link(text,text,bigint,uuid,text),
      agency_platform.invitation_review(text,text,bigint),agency_platform.request_client_invitation(text,text,bigint,text,text,uuid),agency_platform.accept_invitation_link(text,text,uuid,text),agency_platform.agency_accept_invitation(text,text,uuid) TO "${role}"`);
    await db.query("COMMIT");
    console.log("Stage 14 account security policy installed; no email sent or account promoted.");
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
  finally { await db.end(); }
}
main().catch(error => { console.error("Stage 14 migration stopped", safeDatabaseCode(error)); process.exitCode = 1; });
