import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { DriveSourceError } from "../lib/drive-source-policy.js";

async function harness({ authenticated = true } = {}) {
  const calls = [], key = `drive_status_${randomUUID()}`;
  const mocks = {withAdminAudit:(_operation,handler)=>handler,noteAdminAuditError:()=>{},noteAdminAuditOutcome:()=>{}, cookies: async () => ({}), DriveSourceError,
    resolveAdminContext: async () => { if (!authenticated) throw { publicDetails: { status: 403 } }; return { admin: { id: "admin-one" } }; },
    adminErrorResponse: () => Response.json({ error: "Not authorized" }, { status: 403 }),
    assertTrustedOrigin: () => {}, readJsonRequest: request => request.json(), requestSecurityErrorResponse: () => null,
    driveConnectionStatus: async (...args) => { calls.push(args); return { configured: true, connected: false, state: "reconnect_required", hasAuthorization: true }; },
    discoverConnectedSources: async () => { throw new DriveSourceError("reconnect_required", "Reconnect Google Drive", 409); },
    beginDriveConnection() {}, previewConnectedSource() {}, disconnectDriveSource() {},
  };
  globalThis[key] = mocks;
  try {
    const source = await readFile(new URL("../app/api/admin/source-connections/route.js", import.meta.url), "utf8");
    const code = `const {${Object.keys(mocks).join(",")}} = globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import .*;\r?\n/gm, "");
    return { route: await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`), calls };
  } finally { delete globalThis[key]; }
}

test("admin Drive status opts into live verification and returns private responses", async () => {
  const { route, calls } = await harness();
  const request = new Request("https://portal.example/api/admin/source-connections");
  const response = await route.GET(request);
  assert.equal(response.status, 200);
  assert.equal(calls[0][0], "admin-one"); assert.equal(calls[0][1].verifyAccess, true);
  assert.equal(calls[0][1].signal, request.signal);
  assert.equal((await response.json()).connected, false);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
});

test("unauthorized users stop before any Drive verification or network access", async () => {
  const { route, calls } = await harness({ authenticated: false });
  const response = await route.GET(new Request("https://portal.example/api/admin/source-connections"));
  assert.equal(response.status, 403); assert.equal(calls.length, 0);
});

test("discovery returns a specific reconnect response rather than generic 503", async () => {
  const { route } = await harness();
  const request = new Request("https://portal.example/api/admin/source-connections", { method: "POST",
    headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "discover" }) });
  const response = await route.POST(request);
  assert.equal(response.status, 409); assert.equal((await response.json()).code, "reconnect_required");
});
