import test from "node:test";
import assert from "node:assert/strict";
import { acknowledgeTraceBatch, cleanHeaders, cleanUrl, mergeRecords, relationships, safeBody, sanitizeRecord, statusColor } from "../lib/debugger/model.js";
import { debuggerChannel, debuggerCookieBinding, debuggerEnabled, debuggerLabEnabled, debuggerSessionScope, issueDebuggerToken, verifyDebuggerToken } from "../lib/debugger/security.js";
import { buildGraphScene, endpointKey } from "../lib/debugger/scene.js";

test("repeated endpoints ignore parameters without discarding request identities or failures", () => {
  const base = { tabId: "t", navigationId: "n", source: "fetch", category: "api", method: "POST", state: "complete" };
  const records = [{ ...base, id: "a", url: "https://app.test/api/chatkit?mode=work", status: 503, start: 1 }, { ...base, id: "b", url: "https://app.test/api/chatkit?mode=general", status: 200, start: 2 }];
  assert.equal(endpointKey(records[0]), endpointKey(records[1]));
  const scene = buildGraphScene(records, "endpoint");
  assert.equal(scene.display.length, 1); assert.equal(scene.display[0].members.length, 2);
  assert.equal(scene.display[0].latestId, "b"); assert.equal(scene.display[0].state, "failed");
  assert.equal(scene.display[0].color, statusColor(records[0]));
  assert.equal(scene.display[0].errors, 1); assert.equal(scene.alias.get("a"), scene.alias.get("b"));
  assert.equal(buildGraphScene(records, "none").display.length, 2);
  const opened = buildGraphScene(records, "endpoint", new Set([scene.display[0].groupKey]));
  assert.equal(opened.display.length, 3); // stable numbered hub + both requests
  assert.equal(opened.display[0].id, scene.display[0].id);
  assert.equal(opened.display[0].expanded, true);
  assert.equal(opened.membershipParents.size, 2);
  for (const change of [{ method: "GET" }, { source: "server" }, { source: "python" }, { tabId: "other" }, { navigationId: "other" }, { url: "https://backend.test/api/chatkit" }]) {
    assert.notEqual(endpointKey(records[0]), endpointKey({ ...records[0], ...change }));
  }
});
test("endpoint groups stay active until all concurrent members finish", () => {
  const base = { tabId: "t", navigationId: "n", source: "fetch", category: "api", method: "GET", url: "https://app.test/x" };
  const records = [{ ...base, id: "a", state: "complete", start: 1 }, { ...base, id: "b", state: "receiving", start: 2 }];
  const cluster = buildGraphScene(records, "endpoint").display[0];
  assert.equal(cluster.state, "pending"); assert.equal(cluster.start, 2);
  assert.equal(cluster.members.find((r) => r.id === "a").state, "complete");
});

test("debugger explicitly enables production, while fixtures stay development-only", () => {
  assert.equal(debuggerEnabled({ DEBUGGER: "true", NODE_ENV: "production" }), true);
  assert.equal(debuggerEnabled({ DEBUGGER: "false", NODE_ENV: "development" }), false);
  assert.equal(debuggerEnabled({ NODE_ENV: "production" }), false);
  assert.equal(debuggerEnabled({ DEBUGGER: "TRUE", NODE_ENV: "production" }), false);
  assert.equal(debuggerEnabled({ DEBUGGER: "true", NODE_ENV: "development" }), true);
  assert.equal(debuggerLabEnabled({ DEBUGGER: "true", NODE_ENV: "production" }), false);
  assert.equal(debuggerLabEnabled({ DEBUGGER: "true", NODE_ENV: "development" }), true);
});
test("capabilities bind to a login session, not an account-wide identity", () => {
  const secret = "test-only-".repeat(5), now = Date.now();
  const scope = debuggerSessionScope("user-1", "login-A", secret);
  const binding = debuggerCookieBinding("signed-auth-cookie-A", secret);
  const token = issueDebuggerToken(scope, binding, secret, now + 30_000, now);
  assert.equal(verifyDebuggerToken(token, binding, secret, now).s, scope);
  assert.equal(verifyDebuggerToken(token, binding, secret, now + 30_001), null);
  assert.equal(verifyDebuggerToken(token, binding, "other-secret", now), null);
  assert.equal(verifyDebuggerToken(token + "x", binding, secret, now), null);
  assert.equal(verifyDebuggerToken(token, null, secret, now), null);
  assert.equal(verifyDebuggerToken(token, debuggerCookieBinding("signed-auth-cookie-B", secret), secret, now), null);
  assert.notEqual(debuggerChannel(scope, secret), debuggerChannel(debuggerSessionScope("user-1", "login-B", secret), secret));
  assert.notEqual(debuggerChannel(scope, secret), debuggerChannel(debuggerSessionScope("user-2", "login-A", secret), secret));
  assert.ok(!token.includes("signed-auth-cookie-A"));
});
test("all transports drop credentials, raw query values and conversation payloads", () => {
  const headers = cleanHeaders({ Authorization: "Bearer hidden", Cookie: "session=hidden", "X-API-Key": "hidden", "content-type": "application/json" });
  assert.deepEqual(headers, { "content-type": "application/json" });
  const url = cleanUrl("https://user:pass@service.test/x?token=hidden&query=private#secret");
  assert.ok(!/hidden|private|user:pass|secret/.test(url));
  const body = safeBody(JSON.stringify({ credentials: { token: "hidden" }, messages: ["private input"], count: 3 }));
  assert.ok(!/hidden|private input/.test(body)); assert.match(body, /"count": 3/);
  const record = sanitizeRecord({ id: "req:1", secret: "hidden", responseHeaders: { "set-cookie": "hidden" }, status: NaN, transferSize: Infinity, payload: { prompt: "hidden" } });
  assert.ok(!JSON.stringify(record).includes("hidden")); assert.equal(record.status, undefined);
  const error = sanitizeRecord({ id: "error:1", error: "Failed GET https://app.test/search?q=private-customer-data" });
  assert.ok(!error.error.includes("private-customer-data"));
});
test("graph connects explicit initiators or navigation associations, never concurrent timestamps", () => {
  const records = [{ id: "nav:1", navigationId: "nav:1", tabId: "t:1" }, { id: "a", navigationId: "nav:1", tabId: "t:1", url: "https://app.test/a.js", start: 1 }, { id: "b", navigationId: "nav:1", tabId: "t:1", start: 1 }, { id: "c", navigationId: "nav:1", tabId: "t:1", initiatorUrl: "https://app.test/a.js", start: 1 }];
  const edges = relationships(records);
  assert.deepEqual(edges.find((e) => e.to === "b"), { from: "nav:1", to: "b", kind: "navigation association" });
  assert.deepEqual(edges.find((e) => e.to === "c"), { from: "a", to: "c", kind: "initiator source" });
  records.push({ ...records[1], id: "a-duplicate" });
  assert.equal(relationships(records).find((e) => e.to === "c").kind, "navigation association");
});
test("bounded records merge lifecycle updates without duplicating requests", () => {
  const records = new Map();
  mergeRecords(records, [{ id: "a", state: "pending", start: 1 }, { id: "a", state: "complete", status: 404 }, { id: "b", start: 2 }], 2);
  assert.equal(records.size, 2); assert.equal(records.get("a").start, 1); assert.equal(records.get("a").status, 404);
  mergeRecords(records, [{ id: "c", start: 3 }], 2); assert.equal(records.has("a"), false);
  assert.notEqual(statusColor({ state: "complete", status: 404 }), statusColor({ state: "complete", status: 500 }));
  assert.equal(statusColor({ state: "cancelled" }), "#7e8a9c");
});
test("delayed telemetry cannot rewind a completed stream or discard its timing", () => {
  const records = new Map();
  mergeRecords(records, [{ id: "stream:1", revision: 3, state: "complete", duration: 1900, timing: { download: 1200 } }]);
  mergeRecords(records, [{ id: "stream:1", revision: 2, state: "receiving", timing: { ttfb: 700 } }]);
  assert.equal(records.get("stream:1").state, "complete");
  assert.deepEqual(records.get("stream:1").timing, { ttfb: 700, download: 1200 });
  mergeRecords(records, [{ id: "stream:1", revision: 4, state: "pending" }]);
  assert.equal(records.get("stream:1").state, "complete");
});
test("late historical replay cannot evict current live records or active requests", () => {
  const records = new Map();
  mergeRecords(records, [{ id: "live:font", state: "complete", start: 100, end: 120 }, { id: "live:stream", state: "receiving", start: 1 }], 3);
  mergeRecords(records, [{ id: "old:1", state: "complete", start: 10 }, { id: "old:2", state: "complete", start: 11 }, { id: "old:3", state: "complete", start: 12 }], 3);
  assert.equal(records.has("live:font"), true); assert.equal(records.has("live:stream"), true);
  assert.equal(records.has("old:3"), true); assert.equal(records.has("old:1"), false);
});
test("a completion arriving during batch delivery survives the older acknowledgement", () => {
  const pending = new Map([["request:1", { id: "request:1", revision: 1, state: "pending" }]]);
  const inFlight = [...pending.values()];
  pending.set("request:1", { id: "request:1", revision: 2, state: "complete" });
  acknowledgeTraceBatch(pending, inFlight);
  assert.equal(pending.get("request:1").state, "complete");
  acknowledgeTraceBatch(pending, [...pending.values()]);
  assert.equal(pending.size, 0);
});
