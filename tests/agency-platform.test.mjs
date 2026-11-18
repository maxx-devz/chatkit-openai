import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { withAgencyScope, AgencyScopeError } from "../lib/agency-scope.js";
import { approvedDatabaseTarget, migrationArguments, safeDatabaseCode } from "../scripts/agency-platform-config.mjs";

const scope = { agencyId: "11", actorId: "21", clientId: "31" };
function fixture(options = {}) {
  const calls = [];
  let validations = 0;
  const connection = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql === "ROLLBACK" && options.rollbackFails) throw Error("synthetic rollback failure");
      if (sql.includes("direct_login")) return { rows: [{ direct_login: true, safe_role: !options.unsafe, clean_context: !options.initialDirty }] };
      if (sql.includes("AS agency_id")) return { rows: [{ agency_id: options.foreign ? "12" : "11", client_allowed: !options.denied }] };
      if (sql.includes("AS clean_context")) {
        validations++;
        return { rows: [{ clean_context: !(options.dirtyAfter && validations > 0) }] };
      }
      return { rows: [] };
    },
    release(error) { calls.push({ release: true, error }); },
  };
  const pool = { async connect() { calls.push({ connect: true }); return connection; } };
  return { pool, calls };
}

test("agency transactions pin queries and use transaction-local parameterized scope", async () => {
  const { pool, calls } = fixture();
  let leaked;
  const value = await withAgencyScope(pool, scope, async db => {
    leaked = db;
    await db.query("SELECT $1::text", ["fictional"]);
    return "complete";
  });
  assert.equal(value, "complete");
  assert.equal(calls.filter(c => c.connect).length, 1);
  assert.deepEqual(calls.find(c => c.sql?.includes("set_config")).values, ["11", "21", "31"]);
  assert.match(calls.find(c => c.sql?.includes("set_config")).sql, /\$3,true/);
  assert.equal(calls.filter(c => c.sql === "COMMIT").length, 1);
  assert.equal(calls.at(-1).error, undefined);
  assert.throws(() => leaked.query("SELECT 1"), AgencyScopeError);
});

test("invalid or unsafe integer scope fails before obtaining a connection", async () => {
  for (const value of [undefined, 11, "0", "-1", "1; SELECT 1", "9223372036854775808"]) {
    const { pool, calls } = fixture();
    await assert.rejects(withAgencyScope(pool, { ...scope, agencyId: value }, () => {}), AgencyScopeError);
    assert.equal(calls.length, 0);
  }
});

test("a foreign agency, missing grant or privileged role never reaches the callback", async () => {
  for (const options of [{ foreign: true }, { denied: true }, { unsafe: true }, { initialDirty: true }]) {
    const { pool, calls } = fixture(options);
    await assert.rejects(withAgencyScope(pool, scope, () => assert.fail("unauthorized work ran")), AgencyScopeError);
    assert.equal(calls.some(c => c.sql === "COMMIT"), false);
    assert.equal(calls.some(c => c.sql === "ROLLBACK"), true);
    if (options.unsafe || options.initialDirty) assert.ok(calls.at(-1).error);
  }
});

test("callback failure rolls back and releases a clean connection", async () => {
  const { pool, calls } = fixture();
  const failure = Error("fictional operation failed");
  await assert.rejects(withAgencyScope(pool, scope, () => { throw failure; }), e => e === failure);
  assert.equal(calls.some(c => c.sql === "COMMIT"), false);
  assert.equal(calls.some(c => c.sql === "ROLLBACK"), true);
  assert.equal(calls.at(-1).error, undefined);
});

test("unclean state after commit or failed rollback discards the connection", async () => {
  const dirty = fixture({ dirtyAfter: true });
  await assert.rejects(withAgencyScope(dirty.pool, scope, () => 1), AgencyScopeError);
  assert.ok(dirty.calls.at(-1).error);
  const broken = fixture({ rollbackFails: true });
  await assert.rejects(withAgencyScope(broken.pool, scope, () => { throw Error("synthetic"); }));
  assert.ok(broken.calls.at(-1).error);
});

test("migration planning never selects DATABASE_URL or connects", () => {
  const result = spawnSync(process.execPath, ["scripts/migrate-agency-platform.mjs", "--plan"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "synthetic-do-not-connect", AGENCY_MIGRATION_DATABASE_URL: "synthetic-do-not-connect" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PLAN ONLY/);
  assert.match(result.stdout, /No database connection/);
  assert.equal(result.stderr, "");
});

test("migration target requires a dedicated PostgreSQL URL and matching explicit confirmation", () => {
  const fake = "postgresql://fictional:fictional@127.0.0.1:1/disposable_example";
  assert.equal(approvedDatabaseTarget(fake, "disposable_example"), fake);
  for (const [url, name] of [[undefined, "x"], [fake, undefined], [fake, "other"], ["https://example.test/db", "db"]]) {
    assert.throws(() => approvedDatabaseTarget(url, name));
  }
  assert.deepEqual(migrationArguments([]), { apply: false });
  assert.deepEqual(migrationArguments(["--plan"]), { apply: false });
  assert.equal(migrationArguments(["--apply", "--confirm-database", "fictional"]).apply, true);
  assert.throws(() => migrationArguments(["--apply"]));
});

test("database acceptance skips without its dedicated target even when legacy DATABASE_URL exists", () => {
  const result = spawnSync(process.execPath, ["scripts/check-agency-platform-database.mjs"], {
    cwd: new URL("..", import.meta.url), encoding: "utf8",
    env: { ...process.env, DATABASE_URL: "synthetic-do-not-connect", AGENCY_TEST_DATABASE_URL: "" },
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /SKIPPED/);
  assert.match(result.stdout, /DATABASE_URL is ignored/);
  assert.equal(result.stderr, "");
});

test("database errors expose a safe code rather than URLs, SQL or provider messages", () => {
  assert.equal(safeDatabaseCode({ code: "23503", message: "private fictional content" }), "23503");
  assert.equal(safeDatabaseCode({ code: "unsafe private text" }), "agency_database_check_failed");
});
