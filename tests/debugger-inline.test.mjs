import test from "node:test";
import assert from "node:assert/strict";
import { createTraceBuffer, debugCommentObserver, encodeDebugHeader, inlineTraceStream, readDebugHeader, responseWithInlineTrace } from "../lib/debugger/inline.js";

const encode = (value) => new TextEncoder().encode(value);
test("simultaneous requests have no shared records, listeners or history", () => {
  const a = createTraceBuffer(2), b = createTraceBuffer(2);
  a.add([{ id: "a", url: "https://service.test/a?token=hidden", state: "pending", payload: { count: 1 }, responsePreview: '{"count":2}' }]);
  b.add([{ id: "b", state: "complete" }]);
  a.add([{ id: "a", state: "complete" }]);
  assert.deepEqual(b.snapshot().map(r => r.id), ["b"]);
  const exported = JSON.stringify(a.take());
  assert.ok(!/hidden|payload|responsePreview/.test(exported));
  assert.equal(a.snapshot()[0].state, "complete");
  a.close(); a.add([{ id: "late" }]);
  assert.deepEqual(a.snapshot(), []);
  assert.equal(b.snapshot().length, 1);
});
test("header transport is bounded, sanitized, Unicode-safe and leaves JSON untouched", async () => {
  const trace = createTraceBuffer();
  trace.add(Array.from({ length: 100 }, (_, i) => ({ id: `request:${i}`, label: "测试".repeat(100), url: "https://example.test/x?api_key=hidden", start: i })));
  const header = encodeDebugHeader(trace.snapshot());
  assert.ok(header.length < 4000);
  let received = [];
  readDebugHeader(header, batch => { received = batch; });
  assert.ok(received.length > 0 && received.length < 100);
  assert.ok(JSON.stringify(received).includes("测试"));
  assert.ok(!JSON.stringify(received).includes("hidden"));
  const response = responseWithInlineTrace(Response.json({ actual: "unchanged" }), trace);
  assert.deepEqual(await response.json(), { actual: "unchanged" });
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  assert.deepEqual(trace.snapshot(), []);
});
test("SSE comments never corrupt split frames, separators or UTF-8", async () => {
  const original = 'data: {"text":"Hello 世界"}\r\n\r\ndata: {"type":"done"}\n\n';
  const bytes = encode(original), trace = createTraceBuffer();
  const source = new ReadableStream({ pull(controller) { if (!this.index) this.index = 0; if (this.index >= bytes.length) { controller.close(); return; } trace.add([{ id: "server:1", state: "receiving", start: 1 }]); controller.enqueue(bytes.slice(this.index, ++this.index)); } });
  const output = await new Response(inlineTraceStream(source, trace)).text();
  const stripped = output.replace(/^: aoc-debug [^\r\n]*\n\n/gm, "");
  assert.equal(stripped, original);
  assert.ok(output.includes(": aoc-debug "));
  const received = [], observer = debugCommentObserver(batch => received.push(...batch));
  const exported = encode(output);
  for (let i = 0; i < exported.length; i++) observer(exported.slice(i, i + 1));
  assert.ok(received.length > 0);
  assert.ok(received.every(r => r.id === "server:1"));
});
test("metadata updates arrive while upstream is waiting, without another HTTP request", async () => {
  let sourceController;
  const source = new ReadableStream({ start(controller) { sourceController = controller; } });
  const trace = createTraceBuffer(), reader = inlineTraceStream(source, trace).getReader();
  const waiting = reader.read();
  trace.add([{ id: "provider:pending", state: "pending" }]);
  const next = await waiting;
  assert.match(new TextDecoder().decode(next.value), /provider:pending/);
  sourceController.enqueue(encode("data: done\n\n")); sourceController.close();
  while (!(await reader.read()).done) { /* Drain */ }
});
test("partial final frames are not changed, and cancellation reaches upstream", async () => {
  const trace = createTraceBuffer();
  const source = new ReadableStream({ start(controller) { controller.enqueue(encode("data: incomplete")); trace.add([{ id: "start" }]); controller.close(); } });
  const output = await new Response(inlineTraceStream(source, trace)).text();
  assert.ok(output.endsWith("data: incomplete"));
  assert.ok(!output.includes("incomplete: aoc-debug"));
  let cancelled = false;
  const active = new ReadableStream({ cancel() { cancelled = true; } });
  const buffer = createTraceBuffer();
  const reader = inlineTraceStream(active, buffer).getReader();
  await reader.cancel("user stopped");
  assert.equal(cancelled, true); assert.deepEqual(buffer.snapshot(), []);
});
test("malformed or oversized comments never become telemetry", () => {
  const received = [], observe = debugCommentObserver(batch => received.push(...batch));
  observe(encode('data: ' + "x".repeat(150_000) + '\n\n: aoc-debug invalid\n\n'));
  readDebugHeader("invalid!", batch => received.push(...batch));
  assert.deepEqual(received, []);
});
