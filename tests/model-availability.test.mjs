import test from "node:test";
import assert from "node:assert/strict";
import { catalogAvailability, modelBlocked, modelAvailabilityLabel } from "../lib/model-availability.js";
import { createModelAccessStore, classifyModelAccessFailure, probeModelAccess, activateModelAfterAccessTest } from "../lib/provider-model-access.js";
import { selectedProviderModel } from "../lib/provider-configuration.js";
import { validateSiteModel } from "../lib/site-ai-repository.js";

const openai = { id: "openai", apiKey: "synthetic-private-key", defaultHeaders: {} };
const response = (payload, status = 200) => new Response(JSON.stringify(payload), { status });

test("catalog listing never falsely promises billing or inference access", () => {
  const availability = catalogAvailability({ id: "gpt-6-luna" });
  assert.equal(availability.status, "listed");
  assert.equal(modelBlocked({ availability }), false);
  assert.match(modelAvailabilityLabel({ availability }), /credits and quota/);
});

test("retired and account-policy-excluded models are blocked with reasons", () => {
  for (const availability of [catalogAvailability({}, { allowed: false }),
    catalogAvailability({ shutdown_date: "2026-01-01" }, { now: Date.parse("2026-10-28") })]) {
    assert.equal(modelBlocked({ availability }), true);
    assert.match(modelAvailabilityLabel({ availability }), /Unavailable/);
  }
  assert.equal(catalogAvailability({ shutdown_date: "2027-01-01" }, { now: Date.parse("2026-10-28") }).status, "listed");
  assert.equal(modelBlocked({ supportsTools: false }), true);
});

test("both browser and server selection reject a confirmed blocked model", () => {
  const model = { id: "gpt-6-luna", supportsTools: true, availability: { status: "blocked", reason: "No project access" } };
  const catalog = { verified: true, models: [model] };
  assert.throws(() => validateSiteModel(model.id, catalog), /No project access/);
  assert.throws(() => selectedProviderModel("openai", { ...catalog, catalogProvider: "openai", model: model.id }), /No project access/);
});

test("billing, authorization and missing endpoints are classified without exposing raw errors", () => {
  for (const [status, error] of [[402, {}], [429, { code: "insufficient_quota" }],
    [429, { code: "project_spend_limit_exceeded" }], [429, { code: "organization_usage_limit_exceeded" }],
    [401, {}], [403, {}], [404, {}]]) {
    const result = classifyModelAccessFailure(status, { error: { ...error, message: "secret key, private account and provider payload" } });
    assert.equal(result.status, "blocked");
    assert.doesNotMatch(JSON.stringify(result), /secret key|private account|provider payload/);
  }
});

test("rate limits, downtime and unrelated request errors do not become permanent plan restrictions", () => {
  for (const status of [429, 408, 500, 503, 400]) assert.equal(classifyModelAccessFailure(status).status, "temporary");
  assert.equal(classifyModelAccessFailure(400, { error: { message: "Tools are not supported by this model" } }).status, "blocked");
  assert.equal(classifyModelAccessFailure(402, { error: { metadata: { limit_source: "openrouter_in_flight_budget" } } }).status, "temporary");
  assert.equal(classifyModelAccessFailure(429, { error: { code: "rate_limit_exceeded", type: "insufficient_quota" } }).status, "blocked");
});

test("OpenAI access test uses Responses with exact ID and synthetic data only, once", async () => {
  let calls = 0;
  const access = await probeModelAccess(openai, "gpt-6-luna", { fetcher: async (url, init) => {
    calls++;
    assert.equal(url, "https://api.openai.com/v1/responses");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "gpt-6-luna");
    assert.equal(body.max_output_tokens, 128);
    assert.equal(body.store, false);
    assert.equal(body.tools[0].name, "portal_connection_check");
    assert.equal(init.redirect, "error");
    assert.equal(init.headers.Authorization, `Bearer ${openai.apiKey}`);
    assert.doesNotMatch(init.body, /synthetic-private-key|hubstaff|client_id|instructions/i);
    return response({ status: "completed", output: [{ type: "function_call" }] });
  } });
  assert.equal(calls, 1);
  assert.equal(access.status, "available");
});

test("OpenRouter access test uses Chat Completions and preserves its literal model ID", async () => {
  const access = await probeModelAccess({ ...openai, id: "openrouter" }, "vendor/model:free", { fetcher: async (url, init) => {
    assert.equal(url, "https://openrouter.ai/api/v1/chat/completions");
    const body = JSON.parse(init.body);
    assert.equal(body.model, "vendor/model:free");
    assert.equal(body.max_tokens, 128);
    assert.equal(body.tools[0].function.name, "portal_connection_check");
    return response({ choices: [{ message: { role: "assistant" } }] });
  } });
  assert.equal(access.status, "available");
});

test("provider failures and embedded HTTP 200 errors cannot pass activation", async () => {
  const cases = [response({ error: { code: "insufficient_quota" } }, 429),
    response({ error: { code: 402, message: "private details" } }), response({}),
    response({ status: "failed", output: [] })];
  for (const value of cases) {
    const result = await probeModelAccess(openai, "gpt-6-luna", { fetcher: async () => value });
    assert.notEqual(result.status, "available");
    assert.doesNotMatch(JSON.stringify(result), /private details/);
  }
});

test("network failures produce a retryable unknown access state, without retries", async () => {
  let calls = 0;
  const result = await probeModelAccess(openai, "gpt-6-luna", { fetcher: async () => { calls++; throw new Error("private credentials"); } });
  assert.equal(result.status, "temporary");
  assert.equal(calls, 1);
  assert.doesNotMatch(JSON.stringify(result), /private credentials/);
});

test("access results are isolated by provider, API key and model and expire", () => {
  const store = createModelAccessStore();
  const blocked = { status: "blocked", reason: "test" };
  store.set(openai, "model-a", blocked, 1000);
  assert.equal(store.get(openai, "model-a", 1001), blocked);
  for (const provider of [{ ...openai, apiKey: "other-key" }, { ...openai, id: "openrouter" }]) assert.equal(store.get(provider, "model-a", 1001), null);
  assert.equal(store.get(openai, "model-b", 1001), null);
  assert.equal(store.get(openai, "model-a", 301000), null);
  store.set(openai, "model-a", { status: "temporary" }, 1000);
  assert.equal(store.get(openai, "model-a", 31000), null);
});

test("explicit refresh clears only the current credential's access results", () => {
  const store = createModelAccessStore();
  const other = { ...openai, apiKey: "other-key" };
  store.set(openai, "model", { status: "blocked" });
  store.set(other, "model", { status: "available" });
  store.clear(openai);
  assert.equal(store.get(openai, "model"), null);
  assert.equal(store.get(other, "model").status, "available");
});

test("failed access tests preserve existing settings; successful tests alone reach save", async () => {
  let writes = 0;
  const save = async () => { writes++; };
  const options = { store: createModelAccessStore(), probe: async () => ({ status: "blocked" }) };
  await activateModelAfterAccessTest(openai, "model", save, options);
  assert.equal(writes, 0);
  await activateModelAfterAccessTest(openai, "model", save, { ...options, probe: async () => ({ status: "available" }) });
  assert.equal(writes, 1);
});

test("cancelled activation does not save even if the provider test just succeeded", async () => {
  let writes = 0;
  const signal = AbortSignal.abort();
  const result = await activateModelAfterAccessTest(openai, "model", async () => { writes++; },
    { signal, store: createModelAccessStore(), probe: async () => ({ status: "available" }) });
  assert.equal(writes, 0);
  assert.equal(result.status, "temporary");
});
