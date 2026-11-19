import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { approvedDatabaseTarget, safeDatabaseCode } from "./agency-platform-config.mjs";

async function main() {
  const [confirm, database, roleFlag, role, ...rest] = process.argv.slice(2);
  if (confirm !== "--confirm-database" || roleFlag !== "--app-role" || rest.length || !/^[a-z][a-z0-9_]{1,62}$/.test(role || "")) throw Error("Supply the verified operator database and ordinary runtime LOGIN.");
  const url = approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, database);
  const db = new pg.Client({ connectionString: url, connectionTimeoutMillis: 8000 });
  const version = "009_agency_administration";
  const sql = await readFile(new URL("../database/agency-platform/009_agency_administration.sql", import.meta.url), "utf8");
  const checksum = createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
  try {
    await db.connect(); await db.query("BEGIN");
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("SELECT pg_advisory_xact_lock(734901,12)");
    const login = await db.query(`SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolcanlogin AND current_database()=$2
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb AND NOT pg_has_role(oid,'aoc_agency_owner','MEMBER')
      AND has_function_privilege(oid,'agency_platform.job_scope(text,text,text,text,bigint)','EXECUTE')`, [role, database]);
    if (!login.rowCount) throw Error("Incorrect target or runtime role.");
    const ready = await db.query("SELECT 1 FROM agency_platform.schema_migrations WHERE version='008_platform_console'");
    if (!ready.rowCount) throw Error("Stage 12 migration is required.");
    await db.query('GRANT SELECT ON public."session", public.portal_users,public.portal_admins,public.portal_internal_users TO aoc_agency_owner');
    await db.query("GRANT UPDATE(portal_enabled,ai_enabled,updated_at) ON public.portal_clients TO aoc_agency_owner");
    await db.query("GRANT INSERT ON public.portal_audit_events TO aoc_agency_owner");
    const sequence = (await db.query("SELECT pg_get_serial_sequence('public.portal_audit_events','id') seq")).rows[0]?.seq;
    // PostgreSQL supplies the identifier; quote each component without interpolation from user input.
    if (sequence) await db.query(`GRANT USAGE ON SEQUENCE ${sequence.split('.').map(x => '"' + x.replaceAll('"', '""') + '"').join('.')} TO aoc_agency_owner`);
    if ((await db.query("SELECT to_regclass('public.portal_ai_cost_events') found")).rows[0].found) await db.query("GRANT SELECT ON public.portal_ai_cost_events TO aoc_agency_owner");
    await db.query('GRANT TRIGGER ON public.portal_internal_users TO aoc_agency_owner');
    await db.query('GRANT SELECT,INSERT,UPDATE ON public.portal_clients,public.portal_memberships TO aoc_agency_owner');
    await db.query('GRANT USAGE ON SEQUENCE public.portal_clients_id_seq TO aoc_agency_owner');
    await db.query("SET LOCAL ROLE aoc_agency_owner");
    const existing = await db.query("SELECT checksum FROM agency_platform.schema_migrations WHERE version=$1", [version]);
    if (!existing.rowCount) {
      await db.query(sql);
      await db.query("INSERT INTO agency_platform.schema_migrations(version,checksum) VALUES($1,$2)", [version, checksum]);
    } else if (existing.rows[0].checksum !== checksum) throw Error("Applied migration differs.");
    await db.query(`GRANT EXECUTE ON FUNCTION agency_platform.admin_choices(text,text),agency_platform.agency_admin_view(text,text,bigint,text),
      agency_platform.agency_admin_change(text,text,bigint,jsonb),agency_platform.agency_my_invitations(text,text),
      agency_platform.agency_accept_invitation(text,text,uuid) TO "${role}"`);
    await db.query("COMMIT");
    console.log("Stage 13 agency administration schema verified; no workspace activated or administrator promoted.");
  } catch (error) { await db.query("ROLLBACK").catch(() => {}); throw error; }
  finally { await db.end(); }
}
main().catch(error => { console.error("Stage 13 migration stopped", safeDatabaseCode(error)); process.exitCode = 1; });
