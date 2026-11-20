import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { adminIndexProgress, hubstaffSearchScope, SEARCH_FRESHNESS_MS, searchIndexState } from "../lib/hubstaff-search-policy.js";

const url = "https://tasks.hubstaff.com/app/organizations/1/projects/7";
const scope = hubstaffSearchScope("1", url, { HUBSTAFF_ACCESS_TOKEN: "fake-only" });
function stored(changes = {}) {
  return { binding: scope.binding, mapping_url: url, checked_at: new Date(),
    task_count: "190", comment_count: "813", pending_tasks: "110", metadata_complete: true, ...changes };
}

test("Admin counters show actual stored totals after freshness expires without enabling client search", () => {
  const row = stored();
  const now = Date.now() + SEARCH_FRESHNESS_MS + 1000;
  const result = adminIndexProgress(row, scope, now);
  assert.equal(result.savedTaskCount, 190);
  assert.equal(result.savedCommentCount, 813);
  assert.equal(result.savedPendingTasks, 110);
  assert.equal(result.available, false);
  assert.equal(result.taskCount, 0);
  assert.equal(searchIndexState(row, scope, now).available, false);
  assert.equal(result.eligibleForBatch, true);
});

test("Denied access preserves admin inventory but never treats it as authorized client context", () => {
  const result = adminIndexProgress(stored({ failure_code: "access_denied" }), scope);
  assert.equal(result.savedCommentCount, 813);
  assert.equal(result.available, false);
  assert.equal(result.metadataComplete, false);
});

test("Legacy worker batches cannot fabricate zero processed counts; recorded zero is distinct from unknown",()=>{
  const time=new Date();
  const row=stored({last_batch_at:time,last_batch_tasks:0,last_batch_comments:0});
  assert.equal(adminIndexProgress(row,scope).lastBatchTasks,null);
  assert.equal(adminIndexProgress({...row,last_batch_counted_at:time},scope).lastBatchTasks,0);
  assert.equal(adminIndexProgress({...row,last_batch_counted_at:time,last_batch_comments:15},scope).lastBatchComments,15);
});

test("A changed project/credential binding cannot show old inventory as current project progress", () => {
  const result = adminIndexProgress(stored({ binding: "old-project-binding" }), scope);
  assert.equal(result.savedTaskCount, 0);
  assert.equal(result.savedCommentCount, 0);
  assert.equal(result.savedMetadataComplete, false);
  assert.equal(result.available, false);
});

test("Progress scheduling distinguishes queued backfill, ready indexes and active leases", () => {
  const now = Date.now();
  const recent = new Date(now - 15_000);
  assert.equal(adminIndexProgress(stored({ checked_at: recent }), scope, now).eligibleForBatch, true);
  assert.equal(adminIndexProgress(stored({ checked_at: recent, pending_tasks: 0 }), scope, now).eligibleForBatch, false);
  assert.equal(adminIndexProgress(stored({ checked_at: recent, pending_tasks: 0, scan_active: true }), scope, now).eligibleForBatch, true);
  assert.equal(adminIndexProgress(stored({ lease_until: new Date(now + 10_000) }), scope, now).syncing, true);
  assert.equal(adminIndexProgress(null, scope, now).eligibleForBatch, true);
});

async function endpoint({ auth = true, origin = true, result = { clientId: "1", syncedTasks: 20, syncedComments: 100 }, error } = {}) {
  const calls = [], key = `index_route_${randomUUID()}`;
  const mocks = {withAdminAudit:(_operation,handler)=>handler,noteAdminAuditError:()=>{},noteAdminAuditOutcome:()=>{},
    assertTrustedOrigin: () => { calls.push("origin"); if (!origin) throw { security: true }; },
    resolveAdminContext: async () => { calls.push("auth"); if (!auth) throw { publicDetails: { status: 401 } }; },
    adminErrorResponse: () => Response.json({ error: "Sign in again" }, { status: 401 }),
    requestSecurityErrorResponse: e => e.security ? Response.json({ error: "Untrusted origin" }, { status: 403 }) : null,
    readJsonRequest: request => request.json(),
    adminHubstaffSearchStatus: async id => { calls.push({statusClientId:id}); return { clients: [{ id: "1", savedTaskCount: 190 }] }; },
    queueHubstaffSearch: async id => { calls.push({queuedClientId:id}); return {clientId:id,queued:true}; },
    synchronizeHubstaffSearch: async (id, options) => { calls.push({ id, options }); if (error) throw error; return result; },
  };
  globalThis[key] = mocks;
  try {
    const source = await readFile(new URL("../app/api/admin/hubstaff-index/route.js", import.meta.url), "utf8");
    const code = `const {${Object.keys(mocks).join(",")}}=globalThis[${JSON.stringify(key)}];\n`
      + source.replace(/^import .*;\r?\n/gm, "");
    return { route: await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`), calls };
  } finally { delete globalThis[key]; }
}
function request(id = "1") {
  return new Request("https://portal.example/api/admin/hubstaff-index", {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://portal.example" },
    body: JSON.stringify({ clientId: id }),
  });
}

test("Automatic API batches still require trusted origin and admin authentication", async () => {
  for (const settings of [{ auth: false }, { origin: false }]) {
    const { route, calls } = await endpoint(settings);
    const response = await route.POST(request());
    assert.ok([401, 403].includes(response.status));
    assert.equal(calls.filter(call => typeof call === "object").length, 0);
  }
  const { route, calls } = await endpoint({ auth: false });
  assert.equal((await route.GET(new Request("https://portal.example/api/admin/hubstaff-index"))).status, 401);
  assert.ok(!calls.includes("status"));
});

test("Automatic batch response exposes committed processed counts and bounded retry timing", async () => {
  const { route, calls } = await endpoint();
  const response = await route.POST(request());
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.deepEqual(calls.slice(0, 2), ["origin", "auth"]);
  assert.equal(body.syncedTasks, 20);
  assert.equal(body.syncedComments, 100);
  assert.equal(body.retryAfterSeconds, 12);
  assert.ok(Number.isFinite(Date.parse(body.completedAt)));
  assert.equal(calls[2].id, "1");
  assert.ok(calls[2].options.signal instanceof AbortSignal);
  assert.match(response.headers.get("cache-control"), /private, no-store/);
});

test("Invalid client identifiers never reach synchronization", async () => {
  const { route, calls } = await endpoint();
  assert.equal((await route.POST(request("1; DROP TABLE"))).status, 400);
  assert.equal(calls.filter(call => typeof call === "object").length, 0);
});

test("Rate limits and denied access have machine-readable safe backoff codes", async () => {
  for (const status of [401, 403, 429]) {
    const { route } = await endpoint({ error: { publicDetails: { httpStatus: status, message: "PRIVATE PROVIDER DETAIL" } } });
    const response = await route.POST(request());
    const body = await response.json();
    assert.equal(response.status, status === 429 ? 429 : 403);
    assert.equal(body.code, status === 429 ? "hubstaff_rate_limited" : "hubstaff_access_denied");
    assert.ok(!JSON.stringify(body).includes("PRIVATE PROVIDER DETAIL"));
    if (status === 429) assert.equal(response.headers.get("retry-after"), "60");
  }
});

test("Per-client controls replace the standalone index page without embedding paid chat calls", async () => {
  const source = await readFile(new URL("../components/admin/client-hubstaff-index.js", import.meta.url), "utf8");
  assert.match(source, /createClientIndexMonitor/);
  assert.match(source, /instance\.stop\(\)/);
  assert.match(source, /Start syncing/);
  assert.match(source, /Discussions completed/);
  assert.match(source, /Processed counts include updates/);
  assert.doesNotMatch(source, /Sync next batch|setInterval|\/api\/chatkit/);
  const sidebar=await readFile(new URL("../components/admin/admin-sidebar.js",import.meta.url),"utf8");
  assert.doesNotMatch(sidebar,/Project search index|\/admin\/hubstaff-index/);
});

test("Selected-client status validates its ID and queues only after origin and admin checks",async()=>{
  const {route,calls}=await endpoint();
  const response=await route.GET(new Request("https://portal.example/api/admin/hubstaff-index?clientId=2"));
  assert.equal(response.status,200);
  assert.deepEqual(calls[1],{statusClientId:"2"});
  calls.length=0;
  assert.equal((await route.GET(new Request("https://portal.example/api/admin/hubstaff-index?clientId=bad"))).status,400);
  assert.equal(calls.length,1);
  assert.equal((await route.GET(new Request("https://portal.example/api/admin/hubstaff-index?clientId=9999999999999999999"))).status,400);
  calls.length=0;
  const queued=await route.POST(new Request("https://portal.example/api/admin/hubstaff-index",{
    method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:"2",action:"queue"}),
  }));
  assert.equal(queued.status,202);
  assert.deepEqual(calls,["origin","auth",{queuedClientId:"2"}]);
  for(const settings of [{auth:false},{origin:false}]) {
    const f=await endpoint(settings);
    assert.ok([401,403].includes((await f.route.POST(new Request("https://portal.example/api/admin/hubstaff-index",{
      method:"POST",body:JSON.stringify({clientId:"2",action:"queue"}),
    }))).status));
    assert.equal(f.calls.some(call=>call?.queuedClientId),false);
  }
});
