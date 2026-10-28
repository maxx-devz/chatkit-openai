import test from "node:test";
import assert from "node:assert/strict";
import { readClientSpending, spendingPeriod } from "../lib/ai-spending-repository.js";
import { spendingCsv, costStatus, usd } from "../lib/ai-spending-format.js";

test("periods use half-open UTC calendar months, including December and leap years", () => {
  assert.deepEqual(spendingPeriod("2026-12"), { period: "2026-12", start: "2026-12-01T00:00:00.000Z", end: "2027-01-01T00:00:00.000Z" });
  assert.equal(spendingPeriod("2024-02").end, "2024-03-01T00:00:00.000Z");
  for (const period of ["2026-13", "2026-00", "2026-1", "2026-10;DROP TABLE", "", null]) assert.throws(() => spendingPeriod(period));
});

test("money display preserves tiny nonzero costs and never turns unknown into zero", () => {
  assert.equal(usd(null), "Unknown");
  assert.equal(usd(""), "Unknown");
  assert.equal(usd("0"), "$0.00");
  assert.equal(usd("0.0000001"), "< $0.000001");
  assert.equal(usd("0.0003345"), "$0.000335");
  assert.equal(usd("NaN"), "Unknown");
});

test("spending queries preserve decimal strings, missing costs and client scope", async () => {
  let count = 0;
  const result = await readClientSpending({ query: async (sql, values) => {
    if (++count === 1) return { rows: [{ started_at: "2026-10-28T00:00:00Z" }] };
    assert.deepEqual(values, ["2026-10-01T00:00:00.000Z", "2026-11-01T00:00:00.000Z"]);
    assert.match(sql, /c\.id/);
    assert.match(sql, /e\.action='client_ai.reply'/);
    assert.match(sql, /NOT EXISTS/);
    assert.doesNotMatch(sql, /DELETE|UPDATE|INSERT/);
    return { rows: [{ slug: "one", name: "Client one", events: "3", turns: "2", unknown_events: "1",
      estimated_events: "1", reported_events: "1", known_usd: "0.001234567891", reported_usd: "0.001000000000",
      estimated_usd: "0.000234567891", missing_turns: "4", last_recorded: null }] };
  } }, "2026-10");
  assert.equal(result.clients[0].knownUsd, "0.001234567891");
  assert.equal(result.clients[0].missingTurns, 4);
  assert.equal(result.clients[0].partialHistory, true);
  assert.match(costStatus(result.clients[0]), /Incomplete/);
});

test("missing migration is shown as setup required; database failures are not hidden", async () => {
  const result = await readClientSpending({ query: async () => { throw Object.assign(new Error(), { code: "42P01" }); } }, "2026-10");
  assert.equal(result.ready, false);
  assert.match(result.setupMessage, /ai-costs:migrate/);
  await assert.rejects(readClientSpending({ query: async () => { throw new Error("database failed"); } }, "2026-10"));
});

test("CSV preserves monetary precision, flags unknowns and prevents spreadsheet formula injection", () => {
  const csv = spendingCsv({ period: "2026-10", clients: [{ name: '=HYPERLINK("x")', slug: "safe", knownUsd: "0.000000123456",
    reportedUsd: null, estimatedUsd: "0.000000123456", events: 1, turns: 1, estimatedEvents: 1, unpricedEvents: 2, missingTurns: 0 }] });
  assert.match(csv, /0\.000000123456/);
  assert.match(csv, /'\=HYPERLINK/);
  assert.match(csv, /Incomplete/);
  assert.doesNotMatch(csv, /api_key|prompt_text|password/i);
});

test("status distinguishes estimates, reported charges, empty and partial history", () => {
  assert.match(costStatus({ events: 0 }), /No recorded/);
  assert.match(costStatus({ events: 1, estimatedEvents: 1 }), /estimates/);
  assert.match(costStatus({ events: 1, reportedEvents: 1 }), /Provider-reported/);
  assert.match(costStatus({ events: 1, reportedEvents: 1, partialHistory: true }), /Partial history/);
});
