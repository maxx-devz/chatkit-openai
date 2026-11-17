import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { OpenRouterSetupError } from "../lib/openrouter-setup.js";
import { validateSiteModel } from "../lib/site-ai-repository.js";
import { validateGenerationOptions } from "../lib/provider-generation-options.js";

async function endpoint({ auth = true, origin = true, accountError, modelBlocked = false } = {}) {
  const calls = [], key = `provider_route_${randomUUID()}`;
  const mocks = {
    assertTrustedOrigin: () => { calls.push("origin"); if (!origin) throw { security: true }; },
    resolveAdminContext: async () => { calls.push("auth"); if (!auth) throw { publicDetails: {} }; return { admin: { id: "admin-test" } }; },
    adminErrorResponse: () => Response.json({ error: "Sign in" }, { status: 401 }),
    requestSecurityErrorResponse: error => error.security ? Response.json({ error: "Bad origin" }, { status: 403 }) : null,
    readJsonRequest: request => request.json(),
    publicProviderSettings: async () => ({ ready: true }),
    validateProvider: value => value,
    validateProviderKey: (_id, value) => value,
    providerFromKey: (id, apiKey) => ({ id, apiKey }),
    getRuntimeProvider: async id => ({ id, apiKey: "synthetic-saved-key" }),
    checkOpenRouterAccount: async () => { calls.push("metadata"); if (accountError) throw accountError; return { keyVerified: true, generationTested: false }; },
    getModelCatalog: async () => { calls.push("catalog"); return { verified: true, provider: "openrouter", models: [
      { id: "vendor/model:free", supportsTools: true, availability: { status: modelBlocked ? "blocked" : "listed" } },
    ] }; },
    validateSiteModel, validateGenerationOptions, OpenRouterSetupError,
    missingProviderSchemaMessage: () => null,
    saveProviderConfiguration: async (...values) => { calls.push({ saved: values }); },
  };
  globalThis[key] = mocks;
  try {
    const source = await readFile(new URL("../app/api/admin/provider-settings/route.js", import.meta.url), "utf8");
    const code = `const {${Object.keys(mocks).join(",")}}=globalThis[${JSON.stringify(key)}];\n`
      + source.replace(/^import .*;\r?\n/gm, "");
    return { route: await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`), calls };
  } finally { delete globalThis[key]; }
}
function request() {
  return new Request("https://portal.example/api/admin/provider-settings", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ provider: "openrouter", model: "vendor/model:free" }) });
}

test("provider metadata and writes require admin authentication and trusted origin", async () => {
  for (const options of [{ auth: false }, { origin: false }]) {
    const { route, calls } = await endpoint(options);
    assert.ok([401, 403].includes((await route.PUT(request())).status));
    assert.equal(calls.includes("metadata"), false);
    assert.equal(calls.some(call => call.saved), false);
  }
});

test("verify returns sanitized metadata without saving or generating", async () => {
  const { route, calls } = await endpoint();
  const response = await route.POST(request());
  const data = await response.json();
  assert.equal(response.status, 200);
  assert.equal(data.account.keyVerified, true);
  assert.equal(data.account.generationTested, false);
  assert.deepEqual(calls, ["origin", "auth", "metadata", "catalog"]);
  assert.equal(JSON.stringify(data).includes("synthetic-saved-key"), false);
});

test("save rechecks metadata and exact model without a generation probe", async () => {
  const { route, calls } = await endpoint();
  const data = await (await route.PUT(request())).json();
  assert.equal(data.activation.generationTested, false);
  assert.equal(data.activation.id, "vendor/model:free");
  assert.deepEqual(calls.at(-1).saved, ["openrouter", "", "vendor/model:free", "admin-test",
    { model: "vendor/model:free", reasoningEffort: "auto" }]);
});

test("expired credentials, throttled checks and excluded models never change saved settings", async () => {
  for (const options of [{ accountError: new OpenRouterSetupError("Expired key") },
    { accountError: new OpenRouterSetupError("Wait before refreshing", 429) }, { modelBlocked: true }]) {
    const { route, calls } = await endpoint(options);
    const response = await route.PUT(request());
    assert.equal(response.status, options.accountError?.status || 400);
    assert.equal(calls.some(call => call.saved), false);
  }
});
