// Synthetic fixtures and even a fresh schema are rolled back. No provider calls.
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";
import { readClientSpending } from "../lib/ai-spending-repository.js";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  await db.connect();
  await db.query("BEGIN");
  await db.query("SET LOCAL lock_timeout = '3s'");
  await db.query("SET LOCAL statement_timeout = '15s'");
  await db.query(await readFile(new URL("../database/ai-cost-schema.sql", import.meta.url), "utf8"));
  const suffix = randomUUID().replaceAll("-", "");
  const clients = (await db.query(`INSERT INTO portal_clients(slug,display_name)
    VALUES($1,'Synthetic cost client A'),($2,'Synthetic cost client B') RETURNING id,slug`, [`cost-a-${suffix}`, `cost-b-${suffix}`])).rows;
  const period = new Date().toISOString().slice(0, 7);
  const request = randomUUID();
  await db.query(`INSERT INTO portal_ai_usage_events(request_id,client_id,action,status,started_at)
    VALUES($1,$2,'client_ai.reply','succeeded',NOW()),($3,$2,'client_ai.reply','failed',NOW())`, [request, clients[0].id, randomUUID()]);
  const insert = `INSERT INTO portal_ai_cost_events
    (event_key,request_id,client_id,provider,model,kind,status,basis,amount_usd,reason,occurred_at)
    VALUES($1,$2,$3,'openai','gpt-6-luna','chat','succeeded',$4,$5,'synthetic_test',NOW())
    ON CONFLICT(event_key) DO NOTHING`;
  await db.query(insert, [`${request}:0`, request, clients[0].id, "reported", "0.10"]);
  await db.query(insert, [`${request}:1`, request, clients[0].id, "estimated", "0.02"]);
  await db.query(insert, [`${request}:2`, request, clients[0].id, "unknown", null]);
  await db.query(insert, [`${request}:0`, request, clients[0].id, "reported", "9.99"]);
  const second = randomUUID();
  await db.query(insert, [`${second}:0`, second, clients[1].id, "reported", "0"]);
  const initial = await readClientSpending(db, period);
  const a = initial.clients.find(client => client.slug === clients[0].slug);
  const b = initial.clients.find(client => client.slug === clients[1].slug);
  assert.equal(a.knownUsd, "0.120000000000");
  assert.equal(a.reportedUsd, "0.100000000000");
  assert.equal(a.estimatedUsd, "0.020000000000");
  assert.equal(a.events, 3);
  assert.equal(a.unpricedEvents, 1);
  assert.equal(a.missingTurns, 1);
  assert.equal(b.knownUsd, "0.000000000000");
  assert.equal(b.events, 1);
  await db.query(`INSERT INTO portal_ai_usage_monthly(client_id,period_start,requests_used) VALUES($1,$2,150)`, [clients[0].id, `${period}-01`]);
  // Exercise the same scoped allowance deletion as an admin reset, fixtures only.
  await db.query("DELETE FROM portal_ai_usage_monthly WHERE client_id=$1 AND period_start=$2", [clients[0].id, `${period}-01`]);
  const after = await readClientSpending(db, period);
  assert.equal(after.clients.find(client => client.slug === clients[0].slug).knownUsd, a.knownUsd);
  await db.query("SAVEPOINT invalid_cost");
  await assert.rejects(db.query(insert, [`${request}:negative`, request, clients[0].id, "reported", "-1"]), error => error.code === "23514");
  await db.query("ROLLBACK TO SAVEPOINT invalid_cost");
  // Financial history remains after removal of a synthetic client workspace.
  await db.query("DELETE FROM portal_clients WHERE id=$1", [clients[1].id]);
  assert.equal((await db.query("SELECT client_id FROM portal_ai_cost_events WHERE event_key=$1", [`${second}:0`])).rows[0].client_id, null);
  assert.ok((await readClientSpending(db, period)).clients.some(client => client.slug === "__archived__"));
  console.log("PASS exact USD totals, client isolation, unknown costs, duplicate prevention, allowance resets and archived history.");
} catch (error) {
  console.error("AI cost database check failed", { code: error?.code || "test_or_connection_error" });
  process.exitCode = 1;
} finally {
  await db.query("ROLLBACK").catch(() => {});
  await db.end().catch(() => {});
  console.log("Synthetic database changes rolled back. No provider requests were made.");
}
