import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { validateSiteModel } from "../lib/site-ai-repository.js";
import { activateModelAfterAccessTest, createModelAccessStore } from "../lib/provider-model-access.js";
import { missingProviderSchemaMessage } from "../lib/provider-configuration.js";
import { validateGenerationOptions } from "../lib/provider-generation-options.js";

// Exercise the actual route with isolated dependency bindings: no database,
// credentials, provider network traffic, or experimental Node flags required.
async function harness({ access = "available", blocked = false, authenticated = true, ready = true } = {}) {
  const calls = { probes: 0, writes: [], catalogs: 0 };
  let saved = false;
  const provider = { id: "openai", apiKey: "synthetic-private-key", model: "gpt-6-luna" };
  const state = () => ({ ready, setupMessage: ready ? "" : "Missing migration", activeProvider: "openai",
    providers: [{ id: "openai", model: saved ? "gpt-6-luna" : "old-model", configured: true }] });
  const mocks = {
    resolveAdminContext: async () => { if (!authenticated) throw { publicDetails: true }; return { admin: { id: 7 } }; },
    adminErrorResponse: () => Response.json({ error: "Unauthorized" }, { status: 401 }),
    assertTrustedOrigin: headers => { if (headers.get("origin") !== "https://portal.example") throw new Error("Untrusted origin"); },
    readJsonRequest: request => request.json(), requestSecurityErrorResponse: () => null,
    publicProviderSettings: async () => state(), getRuntimeProvider: async () => provider,
    providerFromKey: () => provider, validateProvider: id => id, validateProviderKey: (_id, key) => key,
    saveProviderConfiguration: async (...args) => { calls.writes.push(args); saved = true; },
    getModelCatalog: async (_provider, options) => {
      calls.catalogs++; assert.equal(options.fresh, true);
      return { verified: true, provider: "openai", models: [{ id: "gpt-6-luna", supportsTools: true,
        availability: { status: blocked ? "blocked" : "listed", reason: "Not allowed" } }] };
    },
    modelAccessStore: createModelAccessStore(), validateSiteModel, validateGenerationOptions, missingProviderSchemaMessage,
    activateModelAfterAccessTest: (p, model, save, { signal }) => activateModelAfterAccessTest(p, model, save, {
      signal, store: createModelAccessStore(), probe: async () => {
        calls.probes++;
        return { status: access, reason: access === "available" ? "Test passed" : "Access denied", checkedAt: 123 };
      },
    }),
  };
  const source = await readFile(new URL("../app/api/admin/provider-settings/route.js", import.meta.url), "utf8");
  const key = `provider_route_${randomUUID()}`;
  globalThis[key] = mocks;
  let route;
  try {
    const code = `const {${Object.keys(mocks).join(",")}} = globalThis[${JSON.stringify(key)}];\n`
      + source.replace(/^import .+;\r?\n/gm, "");
    route = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  } finally { delete globalThis[key]; }
  const request = (body, origin = "https://portal.example") => new Request("https://portal.example/api/admin/provider-settings", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify({ provider: "openai", model: "gpt-6-luna", ...body }),
  });
  return { route, calls, request };
}

test("loading model metadata never generates or writes settings", async () => {
  const { route, calls, request } = await harness();
  assert.equal((await route.POST(request({}))).status, 200);
  assert.equal(calls.catalogs, 1);
  assert.equal(calls.probes, 0);
  assert.equal(calls.writes.length, 0);
});

test("activation saves without a generation probe or test consent", async () => {
  const { route, calls, request } = await harness();
  const response = await route.PUT(request({}));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).activation.generationTested, false);
  assert.equal(calls.probes, 0);
  assert.equal(calls.writes.length, 1);
});

test("server rejects blocked models even if a caller bypasses the disabled option", async () => {
  const { route, calls, request } = await harness({ blocked: true });
  assert.equal((await route.PUT(request({ testModel: true }))).status, 400);
  assert.equal(calls.probes, 0);
  assert.equal(calls.writes.length, 0);
});

test("past generation failures do not prevent metadata-validated selection", async () => {
  const { route, calls, request } = await harness({ access: "blocked" });
  const response = await route.PUT(request({ testModel: true }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.activation.id, "gpt-6-luna");
  assert.equal(data.activation.generationTested, false);
  assert.equal(calls.probes, 0);
  assert.equal(calls.writes.length, 1);
});

test("saving writes only the exact validated ID and allowlisted generation settings", async () => {
  const { route, calls, request } = await harness();
  const response = await route.PUT(request({ generationOptions: { reasoningEffort: "low" } }));
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.activation.id, "gpt-6-luna");
  assert.equal(data.activation.generationTested, false);
  assert.deepEqual(calls.writes, [["openai", "", "gpt-6-luna", 7, { model: "gpt-6-luna", reasoningEffort: "low" }]]);
  assert.equal(calls.probes, 0);
  assert.doesNotMatch(JSON.stringify(data), /synthetic-private-key/);
});

test("invalid effort and injected generation parameters cannot change settings", async () => {
  for (const generationOptions of [{ reasoningEffort: "unlimited" }, { apiKey: "injected" }, [], null]) {
    const { route, calls, request } = await harness();
    assert.equal((await route.PUT(request({ generationOptions }))).status, 400);
    assert.equal(calls.writes.length, 0);
    assert.equal(calls.probes, 0);
  }
});

test("authorization, origin and missing migration failures cannot initiate probes", async () => {
  for (const options of [{ authenticated: false }, { ready: false }, {}]) {
    const { route, calls, request } = await harness(options);
    const response = await route.PUT(request({ testModel: true }, options.authenticated === undefined && options.ready === undefined ? "https://evil.example" : "https://portal.example"));
    assert.notEqual(response.status, 200);
    assert.equal(calls.probes, 0);
    assert.equal(calls.writes.length, 0);
  }
});
