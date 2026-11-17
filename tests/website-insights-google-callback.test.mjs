import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

async function callback({ authorized = true, invalidState = false } = {}) {
  const key = `callback_${randomUUID()}`, calls = [];
  const context = { client: { id: "client-one" } };
  const mocks = {
    cookies: async () => ({ get: () => ({ value: "bound-cookie" }), set: (...args) => calls.push({ cookie: args }) }),
    requireClientPermission: async (_headers, permission) => {
      calls.push({ permission });
      if (!authorized) throw new Error("not permitted");
      return context;
    },
    CLIENT_PERMISSIONS: { DOCUMENTS_MANAGE: "manage" },
    CALLBACK: "/api/client/website-insights/google/callback",
    googleConfig: () => ({ origin: "https://portal.example" }),
    finishGoogle: async (...args) => { calls.push({ finish: args }); if (invalidState) throw new Error("private provider details"); return "website-one"; },
    cancelGoogle: async (...args) => { calls.push({ cancel: args }); if (invalidState) throw new Error("private provider details"); return "website-one"; },
  };
  globalThis[key] = mocks;
  try {
    const source = await readFile(new URL("../app/api/client/website-insights/google/callback/route.js", import.meta.url), "utf8");
    const code = `const {${Object.keys(mocks).join(",")}} = globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import .*;\r?\n/gm, "");
    return { route: await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`), calls, context };
  } finally { delete globalThis[key]; }
}
const request = query => new Request("https://portal.example/api/client/website-insights/google/callback?" + query);

test("successful OAuth callback saves authorization without declaring a verified connection", async () => {
  const { route, calls, context } = await callback();
  const response = await route.GET(request("state=state-one&code=code-one"));
  const location = new URL(response.headers.get("location"));
  assert.equal(response.status, 303);
  assert.equal(location.origin, "https://portal.example");
  assert.equal(location.searchParams.get("connection"), "authorization_saved");
  assert.equal(location.searchParams.get("site"), "website-one");
  assert.deepEqual(calls.find(item => item.finish).finish, [context, "state-one", "bound-cookie", "code-one"]);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.equal(response.headers.get("referrer-policy"), "no-referrer");
  assert.equal(calls.find(item => item.cookie).cookie[2].maxAge, 0);
  assert.equal(location.searchParams.has("code"), false);
});

test("cancelled consent consumes the bound attempt without exchanging or deleting saved tokens", async () => {
  const { route, calls, context } = await callback();
  const response = await route.GET(request("error=access_denied&state=state-one"));
  const location = new URL(response.headers.get("location"));
  assert.equal(location.searchParams.get("connection"), "cancelled");
  assert.equal(location.searchParams.get("site"), "website-one");
  assert.deepEqual(calls.find(item => item.cancel).cancel, [context, "state-one", "bound-cookie"]);
  assert.equal(calls.some(item => item.finish), false);
});

test("invalid callback state never displays success or echoes private errors", async () => {
  for (const query of ["error=access_denied&state=bad", "state=bad&code=code-one"]) {
    const { route } = await callback({ invalidState: true });
    const response = await route.GET(request(query));
    const location = new URL(response.headers.get("location"));
    assert.equal(location.searchParams.get("connection"), "failed");
    assert.equal(location.searchParams.has("site"), false);
    assert.equal(location.href.includes("private"), false);
  }
});

test("unauthorized callbacks stop before token exchange or cancellation", async () => {
  const { route, calls } = await callback({ authorized: false });
  const response = await route.GET(request("state=state-one&code=code-one"));
  assert.equal(new URL(response.headers.get("location")).searchParams.get("connection"), "failed");
  assert.equal(calls.some(item => item.finish || item.cancel), false);
});
