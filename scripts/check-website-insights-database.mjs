// Actual repository SQL against session-local TEMP tables. No real client rows,
// reports, connections, core portal tables or Google/website APIs are changed.
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import pg from "pg";
import { InsightError, resourceId, websiteInput } from "../lib/website-insights/policy.js";
import { createAudit, finalizeAudit } from "../lib/website-insights/audit.js";
const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
const names = ["portal_clients", "portal_users", "portal_website_insights_sites", "portal_website_insights_reports", "portal_website_insights_google", "portal_website_insights_oauth_states"];
const rewrite = text => names.reduce((sql, name) => sql.replaceAll(new RegExp(`\\b${name}\\b`, "g"), `aoc_wi_test_${name}`), text);
const query = (text, values) => client.query(rewrite(text), values);
async function operation(text, values) {
  if (text === "BEGIN") return client.query("SAVEPOINT wi_operation");
  if (text === "COMMIT") return client.query("RELEASE SAVEPOINT wi_operation");
  if (text === "ROLLBACK") return client.query("ROLLBACK TO SAVEPOINT wi_operation; RELEASE SAVEPOINT wi_operation");
  return query(text, values);
}
try {
  await client.connect();
  // Pin a transaction-pooler backend for the ENTIRE test. Never shadow the
  // application's actual table names, even in a temporary namespace. The final
  // outer ROLLBACK removes every fixture before returning the backend to its pool.
  await client.query("BEGIN");
  await query("CREATE TEMP TABLE portal_clients(id BIGINT PRIMARY KEY); CREATE TEMP TABLE portal_users(id BIGINT PRIMARY KEY); INSERT INTO portal_clients VALUES(1),(2); INSERT INTO portal_users VALUES(1),(2);");
  const schema = await readFile(new URL("../database/website-insights.sql", import.meta.url), "utf8");
  await query(schema.replaceAll("BEGIN;", "").replaceAll("COMMIT;", "").replaceAll("CREATE TABLE IF NOT EXISTS", "CREATE TEMP TABLE IF NOT EXISTS"));
  const key = `insights_db_${randomUUID()}`;
  globalThis[key] = { randomUUID, InsightError, resourceId, websiteInput, createAudit, finalizeAudit,
    db: { query: operation, connect: async () => ({ query: operation, release() {} }) },
    crawlBatch: async state => { state.stage = "search"; }, publicGet: async () => { throw new Error("No external requests allowed"); },
    pageSpeed: async () => { throw new Error("No external requests allowed"); }, resolvePublicHost: async () => [{ address: "8.8.8.8", family: 4 }],
  };
  const source = await readFile(new URL("../lib/website-insights/store.js", import.meta.url), "utf8");
  const code = `const {${Object.keys(globalThis[key]).join(",")}}=globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import .*;\r?\n/gm, "");
  const store = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  delete globalThis[key];
  const one = { client: { id: "1" }, user: { id: "1" } }, two = { client: { id: "2" }, user: { id: "2" } };
  const site = await store.addWebsite(one, { name: "Temporary test", url: "https://example.com" });
  assert.equal((await store.listWebsites(one)).length, 1); assert.equal((await store.listWebsites(two)).length, 0);
  await assert.rejects(store.getWebsite(two, site.id), error => error.status === 404);
  await assert.rejects(store.editWebsite(two, site.id, { name: "forbidden" }), error => error.status === 404);
  const report = await store.startReport(one, site.id);
  assert.equal(await store.startReport(one, site.id), report);
  await assert.rejects(store.getReport(two, report), error => error.status === 404);
  await assert.rejects(store.advanceReport(two, report, async () => ({})), error => error.status === 404);
  assert.equal((await store.reportHistory(one, site.id)).length, 1);
  // An active lease prevents a second tab from running the same batch.
  await query("UPDATE portal_website_insights_reports SET lease_token=$2,lease_until=NOW()+INTERVAL '60 seconds' WHERE id=$1", [report, randomUUID()]);
  await store.advanceReport(one, report, async () => { throw new Error("A held lease must not advance"); });
  assert.equal((await store.getReport(one, report)).state.stage, "discovery");
  await query("UPDATE portal_website_insights_reports SET lease_until=NOW()-INTERVAL '1 second' WHERE id=$1", [report]);
  await store.advanceReport(one, report, async () => ({ status: "not_connected" }));
  assert.equal((await store.getReport(one, report)).state.stage, "search");
  const done = await store.advanceReport(one, report, async () => ({ status: "not_connected" }));
  assert.equal(done.status, "complete"); assert.equal(done.result.summary.pagesChecked, 0);
  await assert.rejects(store.startReport(one, site.id), error => error.status === 429);
  await store.archiveWebsite(one, site.id);
  assert.equal((await store.listWebsites(one)).length, 0);
  assert.equal((await query("SELECT count(*)::int AS count FROM pg_temp.portal_website_insights_reports")).rows[0].count, 1);
  console.log("PASS real PostgreSQL repository SQL: client isolation, IDOR rejection, saved history, lease recovery, one active run, rate limit and non-destructive archive. Prefixed TEMP fixtures are rolled back before the pooled connection is released.");
} catch (error) {
  console.error("Website Insights database test failed:", error.code || error.name, error instanceof assert.AssertionError ? error.message : "");
  process.exitCode = 1;
} finally { await client.query("ROLLBACK").catch(() => {}); await client.end(); }
