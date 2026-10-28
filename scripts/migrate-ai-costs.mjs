import { readFile } from "node:fs/promises";
import pg from "pg";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run") || ["true", "1"].includes(process.env.npm_config_dry_run);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  if (args.length > 1 || (args.length && args[0] !== "--dry-run")) throw new Error("Usage: npm run ai-costs:migrate -- [--dry-run]");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  await db.connect();
  await db.query("BEGIN");
  await db.query("SET LOCAL lock_timeout = '3s'");
  const prerequisite = await db.query("SELECT to_regclass('public.portal_ai_usage_events') IS NOT NULL AS ready");
  if (!prerequisite.rows[0]?.ready) throw new Error("Run integration-audit:migrate then admin-audit:migrate first.");
  await db.query(await readFile(new URL("../database/ai-cost-schema.sql", import.meta.url), "utf8"));
  await db.query(dryRun ? "ROLLBACK" : "COMMIT");
  console.log(dryRun ? "AI cost migration dry-run passed; changes rolled back."
    : "Client AI cost ledger is ready. Existing accounts, request allowances and history were not changed.");
} catch (error) {
  await db.query("ROLLBACK").catch(() => {});
  const safe = String(error?.message || "Unknown database error")
    .replaceAll(process.env.DATABASE_URL || " ", "[database URL removed]").slice(0, 300);
  console.error(`AI cost migration failed${error?.code ? ` (${error.code})` : ""}: ${safe}`);
  process.exitCode = 1;
} finally { await db.end().catch(() => {}); }
