import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";

async function harness({ unreadable = false, noSaved = false, databaseFailure = false } = {}) {
  const calls = [], key = `usage_${randomUUID()}`;
  const rows = noSaved ? [] : [
    { provider: "openrouter", active: false, encrypted_key: "unused-corrupt-key" },
    { provider: "openai", active: true, encrypted_key: "synthetic-selected-key" },
  ];
  const mocks = { createHash, databasePool: {},
    providerState: async () => { if (databaseFailure) throw new Error("database offline"); return { rows }; },
    getRuntimeProvider: async () => { throw new Error("Usage must not depend on generation configuration"); },
    unsealProviderKey: (provider, encrypted) => { calls.push({ provider, encrypted }); if (unreadable) throw new Error("secret-provider-details"); return "synthetic-key"; },
    resolveAiProvider: () => ({ id: "openrouter", label: "OpenRouter", apiKey: "synthetic-env-key" }),
    readUsage: async (_db, hash) => { calls.push({ hash }); return { clients: [{ used: 17, allowance: 150 }], activity: [{ runs: 20 }], apiStatus: null }; },
    recordUsage() {}, recordProviderStatus() {}, recordAiUsageEvent() {},
  };
  globalThis[key] = mocks;
  try {
    const source = await readFile(new URL("../lib/portal-usage.js", import.meta.url), "utf8");
    const code = `const {${Object.keys(mocks).join(",")}} = globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import .*;\r?\n/gm, "");
    return { usage: await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`), calls };
  } finally { delete globalThis[key]; }
}

test("usage loads the active provider only and keeps credentials out of its response", async () => {
  const { usage, calls } = await harness();
  const result = await usage.loadPortalUsage();
  assert.equal(result.provider, "openai"); assert.equal(result.providerCredentialReady, true);
  assert.equal(result.clients[0].used, 17);
  assert.equal(calls.filter(call => call.encrypted).length, 1);
  assert.equal(calls[0].provider, "openai");
  assert.equal(calls.at(-1).hash, createHash("sha256").update("synthetic-key").digest("hex"));
  assert.equal(JSON.stringify(result).includes("synthetic"), false);
});

test("unreadable selected key does not erase usage or misreport provider readiness", async () => {
  const { usage, calls } = await harness({ unreadable: true });
  const result = await usage.loadPortalUsage();
  assert.equal(result.providerCredentialReady, false); assert.equal(result.clients[0].used, 17);
  assert.equal(result.activity[0].runs, 20); assert.equal(result.apiStatus, null);
  assert.equal(calls.at(-1).hash, null, "unknown credential must not reuse another key's status");
  assert.match(result.providerCredentialMessage, /Stored usage is available/);
  assert.equal(JSON.stringify(result).includes("secret-provider-details"), false);
});

test("environment fallback remains only for the no-saved-provider case", async () => {
  const { usage, calls } = await harness({ noSaved: true });
  const result = await usage.loadPortalUsage();
  assert.equal(result.provider, "openrouter"); assert.equal(result.providerCredentialReady, true);
  assert.equal(calls.some(call => call.encrypted), false);
});

test("database outages still fail instead of displaying fake zero usage", async () => {
  const { usage } = await harness({ databaseFailure: true });
  await assert.rejects(usage.loadPortalUsage(), /database offline/);
});
