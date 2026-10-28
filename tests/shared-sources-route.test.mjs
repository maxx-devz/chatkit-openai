import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DriveSourceError } from "../lib/drive-source-policy.js";

// Exercise the real request guards without Next's server-only import sentinel.
const guardSource = (await readFile(new URL("../lib/request-security.js", import.meta.url), "utf8"))
  .replace(/^import "server-only";\r?\n/m, "");
const { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } = await import(
  `data:text/javascript;base64,${Buffer.from(guardSource).toString("base64")}`);
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3000";

async function harness(authenticated = true) {
  const calls = [];
  const mocks = {
    resolveAdminContext: async () => {
      if (!authenticated) throw { publicDetails: { status: 403 } };
      return { admin: { id: "server-admin-7" } };
    },
    adminErrorResponse: () => Response.json({ error: "AOC Admin required" }, { status: 403 }),
    assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse, DriveSourceError,
    preparedSourcesStatus: async id => { calls.push(["status", id]); return { publications: [] }; },
    savePreparedPublication: async (id, body) => { calls.push(["save", id, body]); return { ready: true }; },
    synchronizePreparedSources: async id => { calls.push(["sync", id]); return {}; },
  };
  const source = await readFile(new URL("../app/api/admin/source-connections/prepared/route.js", import.meta.url), "utf8");
  const key = "shared_route_" + randomUUID();
  globalThis[key] = mocks;
  let route;
  try {
    const code = `const {${Object.keys(mocks).join(",")}}=globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import .+;\r?\n/gm, "");
    route = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
  } finally { delete globalThis[key]; }
  const request = (body, origin = "http://127.0.0.1:3000") => new Request("http://127.0.0.1:3000/api/admin/source-connections/prepared", {
    method: "POST", headers: { origin, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return { route, calls, request };
}

test("Clients/anonymous users cannot read, publish, pause or synchronize shared company knowledge", async () => {
  const { route, calls, request } = await harness(false);
  for (const action of ["save", "disable", "sync"]) {
    assert.equal((await route.POST(request({ action, clientId: "clients" }))).status, 403);
  }
  assert.equal((await route.GET(request({}))).status, 403);
  assert.equal(calls.length, 0);
});

test("Shared source management rejects cross-origin submissions before database/source work", async () => {
  const { route, calls, request } = await harness();
  assert.equal((await route.POST(request({ action: "save", clientId: "clients" }, "https://untrusted.example"))).status, 403);
  assert.equal(calls.length, 0);
});

test("Shared save uses only authenticated publisher identity and returns no cached response", async () => {
  const { route, calls, request } = await harness();
  const response = await route.POST(request({ action: "save", clientId: "clients", enabled: true, consent: true }));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(calls.map(call => call.slice(0, 2)), [["save", "server-admin-7"]]);
});
