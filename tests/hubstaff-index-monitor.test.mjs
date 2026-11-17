import test from "node:test";
import assert from "node:assert/strict";
import { createHubstaffIndexMonitor, nextIndexClient } from "../lib/hubstaff-index-monitor.js";

const flush = async () => { for (let i = 0; i < 5; i++) await new Promise(resolve => setImmediate(resolve)); };
function fixture(t, { clients = [{ id: "1", eligibleForBatch: true }], post, get } = {}) {
  let time = Date.now(), id = 0;
  const timers = new Map(), calls = [], events = { busy: [], batch: [], clients: [], error: [], automatic: [] };
  const monitor = createHubstaffIndexMonitor({
    now: () => time,
    schedule: (fn, delay) => { timers.set(++id, { fn, at: time + delay }); return id; },
    unschedule: key => timers.delete(key),
    onBusy: value => events.busy.push(value), onBatch: (...args) => events.batch.push(args),
    onClients: value => events.clients.push(value), onError: value => events.error.push(value),
    onAutomatic: value => events.automatic.push(value),
    fetchImpl: async (url, options) => {
      assert.equal(url, "/api/admin/hubstaff-index");
      assert.equal(options.credentials, "same-origin");
      assert.equal(options.cache, "no-store");
      calls.push(options);
      return options.method === "POST" ? post ? post(options) : Response.json({
        clientId: JSON.parse(options.body).clientId, syncedTasks: 2, syncedComments: 8, retryAfterSeconds: 12,
      }) : get ? get(options) : Response.json({ clients });
    },
  });
  t.after(() => monitor.stop());
  return { monitor, calls, events, timers,
    async start() { monitor.start(); await flush(); },
    async advance(milliseconds) {
      time += milliseconds;
      for (const [key, timer] of [...timers].sort((a, b) => a[1].at - b[1].at)) {
        if (timer.at <= time && timers.delete(key)) await timer.fn();
      }
      await flush();
    },
    posts: () => calls.filter(call => call.method === "POST"),
  };
}

test("Automatic start runs a bounded batch without a click and observes its saved progress", async t => {
  const f = fixture(t);
  await f.start();
  assert.equal(f.posts().length, 1);
  assert.deepEqual(JSON.parse(f.posts()[0].body), { clientId: "1" });
  assert.deepEqual(f.events.batch[0][1].tasks, 2);
  assert.equal(f.events.batch[0][1].comments, 8);
  assert.ok(f.events.clients.length >= 2, "Refresh after completed commit");
  await f.advance(5000);
  assert.equal(f.posts().length, 1);
  await f.advance(10000);
  assert.equal(f.posts().length, 2, "Request next batch after the per-project wait");
});

test("One in-flight batch still permits live status reads without overlapping POSTs", async t => {
  let finish;
  const f = fixture(t, { post: () => new Promise(resolve => { finish = resolve; }) });
  await f.start();
  const reads = f.calls.length;
  await f.advance(5000);
  await f.advance(5000);
  assert.equal(f.posts().length, 1);
  assert.ok(f.calls.length > reads);
  finish(Response.json({ clientId: "1", syncedTasks: 0, syncedComments: 100 }));
  await flush();
  assert.deepEqual(f.events.busy, ["1", ""]);
  assert.equal(f.events.batch.length, 1);
});

test("Pause finishes the current batch, continues counts, and Resume restarts scheduling", async t => {
  const f = fixture(t);
  await f.start();
  f.monitor.setAutomatic(false);
  const reads = f.calls.length;
  await f.advance(60000);
  assert.equal(f.posts().length, 1);
  assert.ok(f.calls.length > reads);
  f.monitor.setAutomatic(true);
  await f.advance(5000);
  assert.equal(f.posts().length, 2);
});

test("Fair rotation skips leased projects and respects server eligibility even with browser clock skew", () => {
  const clients = [{ id: "1", eligibleForBatch: true }, { id: "2", eligibleForBatch: true }, { id: "3", syncing: true }];
  assert.equal(nextIndexClient(clients, { afterId: "1" }).id, "2");
  assert.equal(nextIndexClient(clients, { afterId: "2" }).id, "1");
  assert.equal(nextIndexClient([{ id: "1", eligibleForBatch: false, nextBatchAt: "2000-01-01" }]), null);
  assert.equal(nextIndexClient([{ id: "1", eligibleForBatch: true, nextBatchAt: "2099-01-01" }]).id, "1");
  assert.equal(nextIndexClient([], {}), null);
  assert.equal(nextIndexClient(clients, { retryAt: new Map([["1", Infinity], ["2", Infinity]]) }), null);
});

test("An acquired lease/skipped batch never fabricates saved/processed counts", async t => {
  const f = fixture(t, { post: () => Response.json({ skipped: true, code: "recent_or_running" }) });
  await f.start();
  assert.equal(f.events.batch.length, 0);
  await f.advance(5000);
  assert.equal(f.posts().length, 1);
});

test("A rate limit backs off ALL projects instead of hammering Hubstaff", async t => {
  const f = fixture(t, { clients: [{ id: "1" }, { id: "2" }], post: () => Response.json({
    error: "Hubstaff rate limit", code: "hubstaff_rate_limited", retryAfterSeconds: 60,
  }, { status: 429 }) });
  await f.start();
  await f.advance(30000);
  assert.equal(f.posts().length, 1);
  await f.advance(30000);
  assert.equal(f.posts().length, 2);
  assert.match(f.events.error[0], /60 seconds/);
  assert.equal(f.events.batch.length, 0);
});

test("Transient failures have exponential delays and never reset the server cursor", async t => {
  const f = fixture(t, { post: () => Response.json({ error: "Temporarily unavailable" }, { status: 503 }) });
  await f.start();
  await f.advance(15000);
  assert.equal(f.posts().length, 2);
  await f.advance(15000);
  assert.equal(f.posts().length, 2);
  await f.advance(15000);
  assert.equal(f.posts().length, 3);
  assert.deepEqual(f.posts().map(call => JSON.parse(call.body)), [{ clientId: "1" }, { clientId: "1" }, { clientId: "1" }]);
});

test("Hubstaff access denied blocks only that project until explicit Resume", async t => {
  const f = fixture(t, { post: () => Response.json({ error: "Denied", code: "hubstaff_access_denied" }, { status: 403 }) });
  await f.start();
  await f.advance(600000);
  assert.equal(f.posts().length, 1);
  f.monitor.setAutomatic(true);
  await f.advance(5000);
  assert.equal(f.posts().length, 2);
});

test("Lost portal authentication stops polling/batching and cannot be resumed without reload", async t => {
  const f = fixture(t, { get: () => Response.json({ error: "Sign in again" }, { status: 401 }) });
  await f.start();
  const calls = f.calls.length;
  await f.advance(600000);
  assert.equal(f.calls.length, calls);
  assert.equal(f.posts().length, 0);
  assert.deepEqual(f.events.automatic, [false]);
  assert.equal(f.monitor.setAutomatic(true), false);
});

test("Unmount stops timers, aborts requests, and ignores late progress responses", async t => {
  let finish;
  const f = fixture(t, { post: () => new Promise(resolve => { finish = resolve; }) });
  await f.start();
  f.monitor.stop();
  assert.equal(f.posts()[0].signal.aborted, true);
  finish(Response.json({ clientId: "1", syncedTasks: 9, syncedComments: 9 }));
  await flush();
  assert.equal(f.events.batch.length, 0);
  assert.equal(f.timers.size, 0);
});

test("Malformed success response cannot be shown as a completed saved batch", async t => {
  const f = fixture(t, { post: () => Response.json({ clientId: "other-client", syncedTasks: 10, syncedComments: 10 }) });
  await f.start();
  assert.equal(f.events.batch.length, 0);
  assert.match(f.events.error[0], /incomplete/);
});

test("No assigned projects or an existing worker lease never triggers a batch", async t => {
  for (const clients of [[], [{ id: "1", syncing: true }], [{ id: "1", eligibleForBatch: false }]]) {
    const f = fixture(t, { clients });
    await f.start();
    assert.equal(f.posts().length, 0);
    f.monitor.stop();
  }
});
