import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { validateSiteModel } from "../lib/site-ai-repository.js";
import { activateModelAfterAccessTest, createModelAccessStore } from "../lib/provider-model-access.js";
import { missingProviderSchemaMessage } from "../lib/provider-configuration.js";
import { validateGenerationOptions } from "../lib/provider-generation-options.js";
import {OpenAIReportingError} from "../lib/openai-reporting-pair.js";
import { OpenRouterSetupError } from "../lib/openrouter-setup.js";

// Exercise the actual route with isolated dependency bindings: no database,
// credentials, provider network traffic, or experimental Node flags required.
async function harness({ access = "available", blocked = false, authenticated = true, ready = true, paired = true, rejectPair = false, reportingReady = true, revoke = false } = {}) {
  const calls = { probes: 0, writes: [], catalogs: 0, pairing:[],auth:0 };
  let saved = false;
  const provider = { id: "openai", apiKey: "synthetic-private-key", model: "gpt-6-luna" };
  const state = () => ({ ready, reportingReady, setupMessage: ready ? "" : "Missing migration", activeProvider: "openai",
    providers: [{ id: "openai", model: saved ? "gpt-6-luna" : "old-model", configured: true, reporting:{paired} }] });
  const mocks = {withAdminAudit:(_operation,handler)=>handler,noteAdminAuditError:()=>{},noteAdminAuditOutcome:()=>{},
    OpenRouterSetupError,OpenAIReportingError,
    verifyOpenAIReportingPair:async input=>{calls.pairing.push(input);if(rejectPair)throw new OpenAIReportingError("Pair rejected");return {adminKey:input.adminKey,binding:{scope:'organization'}};},
    checkOpenRouterAccount: async () => { throw new Error("OpenAI metadata must not use OpenRouter credentials."); },
    resolveAdminContext: async () => { calls.auth++;if (!authenticated||revoke&&calls.auth>1) throw { publicDetails: true }; return { admin: { id: 7 } }; },
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
  assert.deepEqual(calls.writes, [["openai", "", "gpt-6-luna", 7, { model: "gpt-6-luna", reasoningEffort: "low" },null]]);
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

test('new OpenAI chat keys require a reporting pair before any save',async()=>{
 const h=await harness();const r=await h.route.PUT(h.request({apiKey:'synthetic-new-key'}));assert.equal(r.status,400);assert.equal(h.calls.writes.length,0);assert.equal(h.calls.catalogs,0);
});
test('verified reporting and chat configuration reach one save; caller cannot substitute the verification chat key',async()=>{
 const h=await harness();const r=await h.route.PUT(h.request({apiKey:'synthetic-new-key',reporting:{adminKey:'synthetic-admin-key',projectId:'proj_A',organizationId:'org-A',chatKey:'injected-key'}}));assert.equal(r.status,200);
 assert.equal(h.calls.pairing[0].chatKey,'synthetic-private-key');assert.equal(h.calls.writes[0][5].adminKey,'synthetic-admin-key');assert.doesNotMatch(await r.text(),/synthetic-admin-key|synthetic-new-key/);
});
test('rejected pairs, unpaired saves, missing migration and mid-flight revocation never save',async()=>{
 for(const options of [{rejectPair:true},{paired:false},{reportingReady:false},{revoke:true}]){
  const h=await harness(options),body=options.rejectPair?{reporting:{adminKey:'private'}}:{};const r=await h.route.PUT(h.request(body));assert.ok(r.status>=400);assert.equal(h.calls.writes.length,0);
 }
});
