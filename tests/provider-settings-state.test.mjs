import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

test("settings load safely with only one connected provider and preserve model-bound options", async () => {
  const row = { provider: "openai", model: "gpt-6-luna", key_suffix: "test", active: true,
    generation_options: { model: "gpt-6-luna", reasoningEffort: "low" } };
  const mocks = { databasePool: { query: async sql => ({ rows: sql.includes("SELECT c.provider") ? [row] : [{ ready: true }] }) },
    resolveAiProvider: () => ({ id: "openai", model: "gpt-6-luna" }),
    unsealProviderKey: () => "private-test-key", sealProviderKey: () => "sealed",
    validateProvider: () => {}, validateProviderKey: () => {}, recordPortalAuditEvent: () => {},
    providerSetupMessage: () => "" };
  const key = "provider_state_" + randomUUID();
  globalThis[key] = mocks;
  const oldSecret = process.env.PROVIDER_SETTINGS_SECRET;
  process.env.PROVIDER_SETTINGS_SECRET = "synthetic-secret-only-12345678901234567890";
  try {
    const source = await readFile(new URL("../lib/provider-settings.js", import.meta.url), "utf8");
    const code = `const {${Object.keys(mocks).join(",")}}=globalThis[${JSON.stringify(key)}];\n`
      + source.replace(/^import .*;\r?\n/gm, "");
    const providerModule = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const settings = await providerModule.publicProviderSettings();
    assert.equal(settings.ready, true);
    assert.equal(settings.providers[1].configured, false);
    assert.deepEqual(settings.providers[1].generationOptions, {});
    assert.equal(settings.providers[0].generationOptions.reasoningEffort, "low");
    assert.doesNotMatch(JSON.stringify(settings), /private-test-key|encrypted_key/);
    row.model = "gpt-other";
    assert.deepEqual((await providerModule.publicProviderSettings()).providers[0].generationOptions, {});
  } finally {
    delete globalThis[key];
    if (oldSecret === undefined) delete process.env.PROVIDER_SETTINGS_SECRET;
    else process.env.PROVIDER_SETTINGS_SECRET = oldSecret;
  }
});
