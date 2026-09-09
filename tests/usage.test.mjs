import test from "node:test";
import assert from "node:assert/strict";
import { usageValues, readUsage } from "../lib/usage-repository.js";

test("missing or invalid usage remains unknown, including cancelled responses", () => {
  for (const value of [null, {}, { input_tokens: 5, output_tokens: 1 },
    { input_tokens: -1, output_tokens: 1, total_tokens: 0 },
    { input_tokens: "5", output_tokens: 1, total_tokens: 6 }]) {
    assert.deepEqual(usageValues(value), [0, 0, 0, 0]);
  }
  assert.deepEqual(usageValues({ input_tokens: 0, output_tokens: 0, total_tokens: 0 }), [1, 0, 0, 0]);
});

test("missing migration keeps client allowances available; database faults are not zero usage", async () => {
  const query = async sql => {
    if (sql.includes("FROM portal_clients")) return { rows: [{ name: "Paused", portal_enabled: true, ai_enabled: false, used: 18, allowance: 10 }] };
    throw Object.assign(new Error("missing table"), { code: "42P01" });
  };
  const result = await readUsage({ query });
  assert.equal(result.trackingReady, false);
  assert.equal(result.clients[0].remaining, 0);
  assert.equal(result.clients[0].enabled, false);
  await assert.rejects(readUsage({ query: async () => { throw new Error("database offline"); } }), /database offline/);
});
