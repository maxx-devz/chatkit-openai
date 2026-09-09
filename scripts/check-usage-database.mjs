import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { recordUsage, recordProviderStatus } from "../lib/usage-repository.js";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  await db.connect();
  await db.query("BEGIN");
  // Shadow the production table using a connection-local temporary table.
  const schema = await readFile(new URL("../chatkit_backend/usage_schema.sql", import.meta.url), "utf8");
  const table = schema.slice(schema.indexOf("CREATE TABLE"), schema.lastIndexOf("COMMIT;"))
    .replaceAll("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE");
  await db.query(table);
  await db.query("SET LOCAL search_path = pg_temp");
  for (const source of ["client", "admin", "preview"]) {
    await recordUsage(db, source, "2026-09-30T23:59:59Z", { input_tokens: 40, output_tokens: 10, total_tokens: 50 });
    await recordUsage(db, source, "2026-09-30T23:59:59Z", null);
    await recordUsage(db, source, "2026-10-01T00:00:00Z", { input_tokens: 8, output_tokens: 2, total_tokens: 10 });
  }
  const rows = (await db.query("SELECT * FROM portal_ai_activity_monthly ORDER BY period_start,source")).rows;
  assert.equal(rows.length, 6);
  for (const row of rows.slice(0, 3)) {
    assert.equal(Number(row.runs), 2);
    assert.equal(Number(row.reported_runs), 1);
    assert.equal(Number(row.total_tokens), 50);
  }
  assert.equal(rows.slice(3).reduce((sum, row) => sum + Number(row.total_tokens), 0), 30);
  await assert.rejects(recordUsage(db, "invalid", new Date(), null), /Invalid usage source/);
  await recordProviderStatus(db, "key-a", "credit_balance_exhausted", "model-a", "2026-09-09T02:00:00Z");
  await recordProviderStatus(db, "key-b", "rate_limit_exceeded", "model-b", "2026-09-09T02:00:00Z");
  await recordProviderStatus(db, "key-a", "ready", "model-a", "2026-09-09T03:00:00Z");
  await recordProviderStatus(db, "key-a", "credit_balance_exhausted", "model-a", "2026-09-09T01:00:00Z");
  const statuses = (await db.query("SELECT credential_hash,code FROM portal_ai_provider_status ORDER BY credential_hash")).rows;
  assert.deepEqual(statuses, [{credential_hash:"key-a",code:"ready"},{credential_hash:"key-b",code:"rate_limit_exceeded"}]);
  console.log("Usage database passed: atomic totals, unknown usage, separate sources and UTC month boundaries. Changes rolled back.");
} finally {
  await db.query("ROLLBACK").catch(() => {});
  await db.end();
}
