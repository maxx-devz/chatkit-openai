import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { pageSpeed, performanceData, PAGESPEED_TIMEOUT_MS } from "../lib/website-insights/google-data.js";

const root = "https://example.com/";
const measured = () => ({ lighthouseResult: { fetchTime: "2026-10-30T08:00:00Z",
  categories: { performance: { score: .42 }, accessibility: { score: .93 }, seo: { score: .92 }, "best-practices": { score: .77 } },
  audits: { "largest-contentful-paint": { numericValue: 3500, displayValue: "3.5 s" } } } });

test("PageSpeed sends the exact site/device/key with supported bounded response fields", async () => {
  const calls = [];
  for (const strategy of ["mobile", "desktop"]) {
    const result = await pageSpeed(root, strategy, { apiKey: " test-secret ", fetchImpl: async (url, options) => {
      calls.push({ url, options }); return Response.json(measured());
    } });
    const { url, options } = calls.at(-1);
    assert.equal(url.origin, "https://www.googleapis.com");
    assert.equal(url.pathname, "/pagespeedonline/v5/runPagespeed");
    assert.equal(url.searchParams.get("url"), root);
    assert.equal(url.searchParams.get("strategy"), strategy);
    assert.equal(url.searchParams.get("key"), "test-secret");
    assert.deepEqual(url.searchParams.getAll("category"), ["performance", "accessibility", "seo", "best-practices"]);
    assert.equal(url.searchParams.get("fields"), "loadingExperience,lighthouseResult(fetchTime,runtimeError,categories,audits)");
    assert.equal(url.searchParams.get("prettyPrint"), "false");
    assert.equal(options.cache, "no-store"); assert.equal(options.redirect, "error");
    assert.equal(result.status, "available"); assert.equal(result.scores.performance, 42);
    assert.equal(result.lab["largest-contentful-paint"].value, 3500);
    assert.equal(JSON.stringify(result).includes("test-secret"), false);
  }
  assert.equal(calls.length, 2, "one Google request per device; no uncontrolled retries");
});

test("slow PageSpeed requests receive a 90-second budget, not the old 40-second cutoff", async t => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", milliseconds => { assert.equal(milliseconds, 90_000); return controller.signal; });
  const result = await pageSpeed(root, "mobile", { fetchImpl: async (_url, options) => {
    assert.equal(options.signal.aborted, false); return Response.json(measured());
  } });
  assert.equal(result.status, "available"); assert.equal(PAGESPEED_TIMEOUT_MS, 90_000);
});

test("PageSpeed timeouts have a specific safe message without a fake score", async t => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", () => controller.signal);
  const result = await pageSpeed(root, "mobile", { fetchImpl: async () => {
    controller.abort(new DOMException("private request URL", "TimeoutError")); throw controller.signal.reason;
  } });
  assert.equal(result.code, "timeout"); assert.match(result.message, /90 seconds/);
  assert.equal(result.scores, undefined); assert.equal(JSON.stringify(result).includes("private"), false);
});

test("caller cancellation is propagated, not saved as a failed Google measurement", async () => {
  const controller = new AbortController(); controller.abort(new Error("client left"));
  let calls = 0;
  await assert.rejects(pageSpeed(root, "desktop", { signal: controller.signal, fetchImpl: async () => { calls++; } }), /client left/);
  assert.equal(calls, 0);
  const active = new AbortController();
  await assert.rejects(pageSpeed(root, "desktop", { signal: active.signal, fetchImpl: async () => {
    active.abort(new Error("client left during request")); throw active.signal.reason;
  } }), /client left during request/);
});

test("quota failures distinguish configured project quota from anonymous quota", async () => {
  for (const apiKey of ["", "test-secret"]) {
    let calls = 0;
    const result = await pageSpeed(root, "mobile", { apiKey, fetchImpl: async () => { calls++; return new Response("private quota body", { status: 429 }); } });
    assert.equal(result.code, "quota"); assert.equal(calls, 1);
    assert.match(result.message, apiKey ? /configured project/ : /anonymous quota/);
    assert.equal(JSON.stringify(result).includes("private"), false);
  }
});

test("disabled API, invalid key and denied server restrictions are not called timeouts", async () => {
  for (const [status, reason, code] of [[403, "SERVICE_DISABLED", "api_disabled"], [400, "API_KEY_INVALID", "key_invalid"], [403, "API_KEY_HTTP_REFERRER_BLOCKED", "access_denied"]]) {
    const result = await pageSpeed(root, "mobile", { fetchImpl: async () => Response.json({ error: {
      message: "secret provider text", details: [{ reason }] } }, { status }) });
    assert.equal(result.code, code); assert.equal(result.status, "unavailable");
    assert.equal(JSON.stringify(result).includes("secret provider text"), false);
  }
});

test("temporary Google errors remain distinct from unreadable successful responses", async () => {
  const unavailable = await pageSpeed(root, "mobile", { fetchImpl: async () => new Response("provider failed", { status: 503 }) });
  assert.equal(unavailable.code, "google_unavailable");
  const invalid = await pageSpeed(root, "mobile", { fetchImpl: async () => new Response("not JSON") });
  assert.equal(invalid.code, "invalid_response");
  const network = await pageSpeed(root, "mobile", { fetchImpl: async () => { throw new TypeError("fetch failed, key=private-secret"); } });
  assert.equal(network.code, "network"); assert.equal(JSON.stringify(network).includes("private-secret"), false);
});

test("oversized PageSpeed bodies are bounded and do not masquerade as timeouts", async () => {
  const result = await pageSpeed(root, "mobile", { fetchImpl: async () => new Response('"' + "x".repeat(5_000_001) + '"') });
  assert.equal(result.code, "response_too_large"); assert.equal(result.scores, undefined);
});

test("missing/failed lab results and invalid numbers never become successful or zero scores", () => {
  for (const payload of [null, {}, { lighthouseResult: { runtimeError: { code: "NO_FCP" } } }, { lighthouseResult: {} },
    { lighthouseResult: { categories: { performance: { score: Number.NaN }, seo: { score: -1 }, accessibility: { score: 2 } } } }]) {
    assert.equal(performanceData(payload).status, "unavailable");
  }
  const payload = measured(); payload.lighthouseResult.categories.performance.score = 0;
  assert.equal(performanceData(payload).scores.performance, 0, "an actual zero remains a measured zero");
});

test("route budget exceeds the Google timeout and batch lease outlives the route", async () => {
  const route = await readFile(new URL("../app/api/client/website-insights/route.js", import.meta.url), "utf8");
  const store = await readFile(new URL("../lib/website-insights/store.js", import.meta.url), "utf8");
  const duration = Number(route.match(/export const maxDuration = (\d+)/)[1]);
  const lease = Number(store.match(/lease_until=NOW\(\)\+INTERVAL '(\d+) seconds'/)[1]);
  assert.ok(duration * 1000 > PAGESPEED_TIMEOUT_MS);
  assert.ok(lease > duration, "another tab must not claim a still-running measurement");
});
