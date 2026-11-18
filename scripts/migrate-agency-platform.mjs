import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { approvedDatabaseTarget, migrationArguments, safeDatabaseCode } from "./agency-platform-config.mjs";

export const migrationVersion = "001_agency_foundation";
export async function agencyMigration() {
  const sql = await readFile(new URL(`../database/agency-platform/${migrationVersion}.sql`, import.meta.url), "utf8");
  return { sql, checksum: createHash("sha256").update(sql).digest("hex") };
}

// Diagnostics/migrations use one short-lived standard pg client, not an app pool.
export async function applyAgencyMigration(connection) {
  const { sql, checksum } = await agencyMigration();
  await connection.query("BEGIN");
  try {
    await connection.query("SET LOCAL lock_timeout='3s'");
    await connection.query("SET LOCAL statement_timeout='30s'");
    await connection.query("SELECT pg_advisory_xact_lock(734901,3)");
    await connection.query("SET LOCAL ROLE aoc_agency_owner");
    const { rows: [existing] } = await connection.query(
      "SELECT to_regclass('agency_platform.schema_migrations') IS NOT NULL AS installed");
    if (existing.installed) {
      const { rows } = await connection.query(
        "SELECT checksum FROM agency_platform.schema_migrations WHERE version=$1", [migrationVersion]);
      if (rows.length !== 1 || rows[0].checksum !== checksum) {
        throw new Error("Agency migration version/checksum mismatch; review the target without rewriting history.");
      }
    } else {
      const { rows: [namespace] } = await connection.query(
        "SELECT to_regnamespace('agency_platform') IS NOT NULL AS installed");
      if (namespace.installed) throw new Error("An unversioned agency schema already exists; review it first.");
      await connection.query(sql);
      await connection.query(
        "INSERT INTO agency_platform.schema_migrations(version,checksum) VALUES($1,$2)", [migrationVersion, checksum]);
    }
    await connection.query("COMMIT");
  } catch (error) {
    await connection.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

async function main() {
  const options = migrationArguments(process.argv.slice(2));
  if (!options.apply) {
    await agencyMigration();
    console.log("PLAN ONLY: 000_role_setup.sql needs authorized DBA review; 001_agency_foundation.sql adds the versioned foundation. No database connection, backfill or agency route.");
    return;
  }
  const connectionString = approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL, options.database);
  const connection = new pg.Client({ connectionString, connectionTimeoutMillis: 8000 });
  try {
    await connection.connect();
    const { rows: [target] } = await connection.query("SELECT current_database() AS database");
    if (target?.database !== options.database) throw new Error("The connected database does not match the approved name.");
    await applyAgencyMigration(connection);
    console.log("Agency foundation migration verified/applied. No legacy ownership was assigned; agency routes remain disabled.");
  } finally {
    await connection.end().catch(() => {});
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch(error => {
    console.error(`Agency migration stopped (${safeDatabaseCode(error)}). Check the private target, role setup and migration version. No credentials are printed.`);
    process.exitCode = 1;
  });
}
