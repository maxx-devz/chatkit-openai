import { readFile } from "node:fs/promises";
import pg from "pg";

// Prefer the explicit operator connection; the application runtime need not own tables.
const connectionString = process.env.SUPABASE_MIGRATION_DATABASE_URL?.trim() || process.env.DATABASE_URL?.trim();
if (!connectionString) throw new Error("Set DATABASE_URL or the private migration connection first.");
const db = new pg.Client({ connectionString, connectionTimeoutMillis: 8000, query_timeout: 55000,
  application_name: "aoc_site_ai_migration" });
let connected = false;
try {
  console.log("Site AI migration: connecting with the configured migration connection…");
  await db.connect();
  connected = true;
  await db.query("BEGIN");
  await db.query("SET LOCAL lock_timeout='5s'");
  await db.query("SET LOCAL statement_timeout='45s'");
  console.log("Site AI migration: checking existing model settings…");
  await db.query(await readFile(new URL("../chatkit_backend/site_ai_schema.sql", import.meta.url), "utf8"));
  console.log("Site AI migration: applying paired reporting fields…");
  await db.query(await readFile(new URL("../database/openai-reporting-pair.sql", import.meta.url), "utf8"));
  await db.query(await readFile(new URL("../database/openai-reporting-organization.sql", import.meta.url), "utf8"));
  await db.query("COMMIT");
  console.log("Site-wide AI model and paired reporting settings are ready. Existing settings are preserved.");
} catch (error) {
  if (connected) await db.query("ROLLBACK").catch(() => {});
  const code = error?.code || "connection_error";
  const help = code === "42501" ? "Use the private table-owner migration connection; keep the application runtime role restricted."
    : code === "55P03" ? "The schema is busy. No changes were committed. Retry when current requests finish."
    : code === "57014" ? "The migration timed out. No changes were committed. Check database availability."
    : "Check database reachability and the configured migration connection. Credentials were not logged.";
  console.error("Site AI migration failed", { code, help });
  process.exitCode = 1;
} finally { await db.end(); }
