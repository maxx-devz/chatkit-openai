import test from "node:test";
import assert from "node:assert/strict";

import {
  isReplyFetch,
  isReplyRequest,
  observeWorkflowStream,
  streamWithWorkflow,
  workflowMarker,
} from "../lib/chatkit-workflow.js";
import { createClientAiWorkflowStore } from "../components/portal/client-ai-workflow-store.js";

const encoder = new TextEncoder();

test("only reply operations start the client workflow", async () => {
  assert.equal(isReplyRequest({ type: "threads.create" }), true);
  assert.equal(isReplyRequest({ type: "threads.add_user_message" }), true);
  assert.equal(isReplyRequest({ type: "threads.retry_after_item" }), true);
  assert.equal(isReplyRequest({ type: "threads.list" }), false);
  assert.equal(await isReplyFetch("/api/chatkit", { body: JSON.stringify({ type: "threads.create" }) }), true);
  assert.equal(await isReplyFetch(new Request("https://example.test/api/chatkit", {
    method: "POST", body: JSON.stringify({ type: "threads.list" }),
  })), false);
});

test("workflow markers arrive before the backend while ChatKit bytes remain unchanged", async () => {
  let release;
  const backend = new Promise((resolve) => { release = resolve; });
  const response = streamWithWorkflow(async (send) => {
    send("hubstaff");
    await backend;
    send("backend");
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"thread.item.done","item":{"type":"assistant_message"}}\n\n'));
        controller.close();
      },
    }), { headers: { "Content-Type": "text/event-stream" } });
  });
  const reader = response.body.getReader();
  const first = await reader.read();
  const second = await reader.read();
  assert.equal(new TextDecoder().decode(first.value), workflowMarker("access"));
  assert.equal(new TextDecoder().decode(second.value), workflowMarker("hubstaff"));
  release();
  const remaining = [];
  while (true) {
    const chunk = await reader.read();
    if (chunk.done) break;
    remaining.push(new TextDecoder().decode(chunk.value));
  }
  assert.equal(remaining.join(""), `${workflowMarker("backend")}${workflowMarker("stream")}data: {"type":"thread.item.done","item":{"type":"assistant_message"}}\n\n`);
});

test("client observes markers split across chunks without changing the SSE reply", async () => {
  const wire = `${workflowMarker("access")}${workflowMarker("backend")}data: {"type":"thread.item.done"}\n\n`;
  const parts = [wire.slice(0, 8), wire.slice(8, 29), wire.slice(29)];
  const response = new Response(new ReadableStream({
    start(controller) {
      for (const part of parts) controller.enqueue(encoder.encode(part));
      controller.close();
    },
  }), { headers: { "Content-Type": "text/event-stream" } });
  const stages = [];
  const observed = observeWorkflowStream(response, (stage) => stages.push(stage));
  assert.equal(await observed.text(), wire);
  assert.deepEqual(stages, ["access", "backend"]);
});

test("reply stage waits for an actual assistant event, not thread metadata", async () => {
  const response = streamWithWorkflow(async (send) => {
    send("ready");
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode('data: {"type":"thread.created"}\n\n'));
        controller.enqueue(encoder.encode('data: {"type":"thread.item.updated","update":{"type":"assistant_message.content_part.text_delta"}}\n\n'));
        controller.close();
      },
    }), { headers: { "Content-Type": "text/event-stream" } });
  });
  const wire = await response.text();
  assert.ok(wire.indexOf('"thread.created"') < wire.indexOf(workflowMarker("stream")));
  assert.ok(wire.indexOf(workflowMarker("stream")) < wire.indexOf('"assistant_message.content_part.text_delta"'));
});

test("a failed backend becomes a ChatKit-compatible stream error", async () => {
  const response = streamWithWorkflow(async () => Response.json({ error: "Assistant unavailable" }, { status: 503 }));
  const wire = await response.text();
  assert.match(wire, /^: aoc-workflow access\n\n/);
  assert.match(wire, /"type":"error"/);
  assert.match(wire, /Assistant unavailable/);
});

test("workflow state ignores stale stages when a new prompt begins", () => {
  const workflow = createClientAiWorkflowStore();
  const first = workflow.start("work");
  workflow.advance(first, "hubstaff");
  const second = workflow.start("general");
  workflow.advance(first, "backend");
  workflow.advance(second, "backend");
  assert.deepEqual(workflow.getSnapshot().steps, ["sending", "backend"]);
  assert.equal(workflow.getSnapshot().mode, "general");
  workflow.finish(first);
  assert.equal(workflow.getSnapshot().closing, false);
  workflow.finish(second);
  assert.equal(workflow.getSnapshot().closing, true);
});
