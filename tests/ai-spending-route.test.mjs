import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";

async function endpoint(authorized) {
  let reads = 0;
  const key = `cost_route_${randomUUID()}`;
  globalThis[key] = {
    resolveAdminContext: async () => { if (!authorized) throw { publicDetails: true }; },
    adminErrorResponse: () => Response.json({ error: "Forbidden" }, { status: 403 }),
    databasePool: {},
    readClientSpending: async (_db, period) => { reads++; return { ready: true, period, clients: [{ name: "Admin-only financial data" }] }; },
  };
  const source = await readFile(new URL("../app/api/admin/ai-spending/route.js", import.meta.url), "utf8");
  try {
    const code = `const {resolveAdminContext,adminErrorResponse,databasePool,readClientSpending}=globalThis[${JSON.stringify(key)}];\n`
      + source.replace(/^import .+;\r?\n/gm, "");
    const route = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
    const response = await route.GET(new Request("https://portal.example/api/admin/ai-spending?month=2026-10"));
    return { response, reads };
  } finally { delete globalThis[key]; }
}

test("client/unauthenticated accounts cannot read or query the financial endpoint", async () => {
  const { response, reads } = await endpoint(false);
  assert.equal(response.status, 403);
  assert.equal(reads, 0);
  assert.doesNotMatch(await response.text(), /financial data/);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
});

test("only authorized admins receive the selected UTC month, without caching", async () => {
  const { response, reads } = await endpoint(true);
  assert.equal(response.status, 200);
  assert.equal(reads, 1);
  assert.equal((await response.json()).period, "2026-10");
  assert.match(response.headers.get("cache-control"), /private, no-store/);
});
