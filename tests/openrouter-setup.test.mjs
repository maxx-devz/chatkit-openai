import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { checkOpenRouterAccount, openRouterAccountSummary, openRouterModelDetails, isOpenRouterFreeModel,
  constrainFreeRouter, visibleProviderModels, OpenRouterSetupError } from "../lib/openrouter-setup.js";
import { catalogAvailability, modelBlocked } from "../lib/model-availability.js";

test("key summary is allowlisted, not a raw key/account response or a claimed generation test", () => {
  const result = openRouterAccountSummary({ label: "secret", hash: "secret", organization_id: "secret",
    is_free_tier: true, limit_remaining: 5, free_model_daily_requests: { used: 0, limit: 50, remaining: 50 } }, 123);
  assert.equal(JSON.stringify(result).includes("secret"), false);
  assert.deepEqual(result.freeRequests, { used: 0, limit: 50, remaining: 50 });
  assert.equal(result.isFreeTier, true);
  assert.equal(result.keyLimitRemainingUsd, 5);
  assert.equal(result.generationTested, false);
});

test("missing quotas stay unknown, zero stays zero, deprecated request limits and USD usage are not request counts", () => {
  assert.deepEqual(openRouterAccountSummary({ usage_daily: 12, rate_limit: { requests: 999 } }).freeRequests,
    { used: null, limit: null, remaining: null });
  assert.equal(openRouterAccountSummary({ free_model_daily_requests: { remaining: 0 } }).freeRequests.remaining, 0);
  assert.equal(openRouterAccountSummary({ free_model_daily_requests: { remaining: "50" } }).freeRequests.remaining, null);
});

test("expired, disabled and invalid key metadata cannot be activated", () => {
  for (const data of [null, [], { disabled: true }, { expires_at: "2020-01-01T00:00:00Z" }]) {
    assert.throws(() => openRouterAccountSummary(data), OpenRouterSetupError);
  }
});

test("connection check sends only metadata GET without following redirects", async () => {
  let calls = 0;
  const result = await checkOpenRouterAccount({ apiKey: "fake-only" }, { fetchImpl: async (url, options) => {
    calls++;
    assert.equal(url, "https://openrouter.ai/api/v1/key");
    assert.equal(options.body, undefined);
    assert.equal(options.redirect, "error");
    assert.equal(options.headers.Authorization, "Bearer fake-only");
    return Response.json({ data: { is_free_tier: true } });
  } });
  assert.equal(calls, 1);
  assert.equal(result.keyVerified, true);
});

test("connection errors are actionable, distinguish throttling and never echo provider bodies", async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(checkOpenRouterAccount({ apiKey: "fake" }, { fetchImpl: async () =>
      new Response("private provider diagnostic", { status }) }), error => {
      assert.equal(error.message.includes("private"), false);
      assert.equal(error.status, status === 429 ? 429 : 400);
      return true;
    });
  }
});

test("free allowance uses free IDs, not misleading zero-pricing or display names", () => {
  for (const id of ["openrouter/free", "vendor/model:free"]) assert.equal(isOpenRouterFreeModel(id), true);
  for (const id of ["vendor/free-name", "vendor/model", "vendor/model:free:online", undefined]) assert.equal(isOpenRouterFreeModel(id), false);
  const model = openRouterModelDetails({ id: "vendor/model", pricing: { prompt: "0", completion: "0" } });
  assert.equal(model.free, false);
  assert.equal(model.zeroPriced, true);
  assert.equal(openRouterModelDetails({ id: "vendor/model", pricing: { prompt: "0", completion: "0", request: "0.1" } }).zeroPriced, false);
});

test("routers are not assumed to support tools and cannot conceal an empty free candidate pool", () => {
  assert.equal(openRouterModelDetails({ id: "openrouter/free" }).supportsTools, false);
  const router = { id: "openrouter/free", free: true, supportsTools: true, availability: { status: "listed" } };
  const free = { ...router, id: "vendor/model:free" };
  assert.equal(modelBlocked(constrainFreeRouter([router])[0]), true);
  assert.equal(modelBlocked(constrainFreeRouter([router, { ...free, supportsTools: false }])[0]), true);
  assert.equal(modelBlocked(constrainFreeRouter([router, { ...free, availability: { status: "blocked" } }])[0]), true);
  assert.equal(modelBlocked(constrainFreeRouter([router, free])[0]), false);
});

test("model search and free filter never mutate or silently switch a saved model", () => {
  const models = [{ id: "vendor/free:free", label: "First", free: true }, { id: "vendor/paid", label: "Second", free: false }];
  assert.deepEqual(visibleProviderModels(models, { freeOnly: true }).map(m => m.id), ["vendor/free:free"]);
  assert.deepEqual(visibleProviderModels(models, { query: "SECOND" }).map(m => m.id), ["vendor/paid"]);
  assert.equal(models.length, 2);
});

async function catalogFor(publicModels, allowedIds, providerId = "openrouter") {
  const key = `catalog_${randomUUID()}`;
  const mocks = { createHash, catalogAvailability, modelBlocked, constrainFreeRouter, openRouterModelDetails,
    resolveAiProvider: () => ({ id: providerId, apiKey: "fake", model: "openrouter/free" }),
    OpenAI: class { models = { list: async function* () { yield* publicModels; } }; },
    fetch: async () => Response.json({ data: allowedIds.map(id => ({ id })) }),
  };
  globalThis[key] = mocks;
  try {
    const source = await readFile(new URL("../lib/openai-models.js", import.meta.url), "utf8");
    const code = `const {${Object.keys(mocks).join(",")}}=globalThis[${JSON.stringify(key)}];\n`
      + source.replace(/^import .*;\r?\n/gm, "");
    const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    return module.getModelCatalog();
  } finally { delete globalThis[key]; }
}

test("catalog keeps text Instruct models, excludes non-text and blocks account-excluded tools", async () => {
  const text = id => ({ id, architecture: { output_modalities: ["text"] }, supported_parameters: ["tools"], pricing: { prompt: "0", completion: "0" } });
  const result = await catalogFor([text("openrouter/free"), text("vendor/instruct:free"), text("vendor/denied:free"),
    { ...text("vendor/image-only:free"), architecture: { output_modalities: ["image"] } }], ["openrouter/free", "vendor/instruct:free"]);
  assert.equal(result.models.length, 3);
  assert.equal(modelBlocked(result.models.find(m => m.id === "vendor/instruct:free")), false);
  assert.equal(modelBlocked(result.models.find(m => m.id === "vendor/denied:free")), true);
  assert.equal(modelBlocked(result.models.find(m => m.id === "openrouter/free")), false);
});
