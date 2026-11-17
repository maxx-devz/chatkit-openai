import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { InsightError, resourceId } from "../lib/website-insights/policy.js";
import { reportCsv } from "../lib/website-insights/presentation.js";
const id = "a010a010-a010-a010-a010-a010a010a010";
async function endpoint({ role = "member", origin = true, authorized = true } = {}) {
  const key = `insights_${randomUUID()}`, calls = [];
  const context = { client: { id: "1" }, user: { id: "2" } };
  const mocks = {
    requireClientPermission: async (_headers, permission) => { calls.push(permission); if (!authorized || (role === "viewer" && permission !== "read") || role === "member" && permission === "manage") throw new InsightError("denied", "Not permitted", 403); return context; },
    CLIENT_PERMISSIONS: { OVERVIEW_READ: "read", DOCUMENTS_CONTRIBUTE: "write", DOCUMENTS_MANAGE: "manage" },
    assertTrustedOrigin: () => { if (!origin) throw new InsightError("origin", "Untrusted origin", 403); },
    readJsonRequest: request => request.json(), requestSecurityErrorResponse: () => null,
    portalErrorResponse: () => Response.json({ error: "Unexpected request" }, { status: 500 }), InsightError, resourceId, reportCsv,
    listWebsites: async ctx => { calls.push({ listClient: ctx.client.id }); return []; },
    addWebsite: async (ctx, input) => { calls.push({ addClient: ctx.client.id, input }); return { id }; },
    getReport: async (ctx, report) => ({ id: resourceId(report), client: ctx.client.id, result: { findings: [] } }),
    startReport: async () => id, advanceReport: async ctx => { calls.push({ advancedClient: ctx.client.id }); return { id }; },
    reportHistory: async () => [], googleStatus: async () => ({ connected: false }), googleProperties: async () => [],
    selectGoogleProperty: async () => { calls.push("select"); }, disconnectGoogle: async () => { calls.push("disconnect"); },
    editWebsite: async () => ({}), archiveWebsite: async () => { calls.push("archive"); }, websiteSearchData: () => ({}),
  };
  globalThis[key] = mocks;
  try {
    const source = await readFile(new URL("../app/api/client/website-insights/route.js", import.meta.url), "utf8");
    const code = `const {${Object.keys(mocks).join(",")}} = globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import .*;\r?\n/gm, "");
    return { route: await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`), calls };
  } finally { delete globalThis[key]; }
}
const request = (body, query = "") => new Request("https://portal.example/api/client/website-insights" + query, body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {});
test("anonymous, viewer writes and foreign-origin requests stop before feature actions", async () => {
  for (const options of [{ authorized: false }, { role: "viewer" }, { origin: false }]) {
    const { route, calls } = await endpoint(options);
    assert.equal((await route.POST(request({ action: "add", name: "test", url: "https://example.com" }))).status, 403);
    assert.equal(calls.some(value => value.addClient), false);
  }
});
test("browser-supplied client ID never replaces authenticated membership context", async () => {
  const { route, calls } = await endpoint();
  assert.equal((await route.POST(request({ action: "add", clientId: "other-client", name: "test", url: "https://example.com" }))).status, 201);
  assert.equal(calls.find(value => value.addClient).addClient, "1");
});
test("only client managers may connect properties, disconnect Google or archive sites", async () => {
  for (const action of ["properties", "select-property", "disconnect", "archive"]) {
    const { route, calls } = await endpoint({ role: "member" });
    assert.equal((await route.POST(request({ action, site: id }))).status, 403);
    assert.ok(!calls.includes("archive") && !calls.includes("disconnect") && !calls.includes("select"));
  }
});
test("downloads require authenticated read access, are private and use actual CSV/JSON formats", async () => {
  const { route } = await endpoint({ role: "viewer" });
  for (const format of ["json", "csv"]) {
    const response = await route.GET(request(null, `?report=${id}&download=${format}`));
    assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "private, no-store");
    assert.match(response.headers.get("content-disposition"), /attachment/);
    assert.match(response.headers.get("content-type"), format === "csv" ? /text\/csv/ : /application\/json/);
  }
});
test("batch advancement binds to the authenticated client and rejects arbitrary report IDs", async () => {
  const { route, calls } = await endpoint();
  assert.equal((await route.POST(request({ action: "advance", report: "not-a-report" }))).status, 400);
  assert.ok(!calls.some(value => value.advancedClient));
  assert.equal((await route.POST(request({ action: "advance", report: id, clientId: "other" }))).status, 200);
  assert.equal(calls.find(value => value.advancedClient).advancedClient, "1");
});
