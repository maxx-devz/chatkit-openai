import assert from "node:assert/strict";
import test from "node:test";

import { createClientAiWorkflowStore } from "../components/portal/client-ai-workflow-store.js";
import {
  visibleWorkflowNodes,
  pendingWorkflowHops,
  workflowCurve,
  workflowCurvePath,
  workflowCurvePoint,
  workflowFlightKeyframes,
  workflowNodeForStage,
  workflowNodePoint,
} from "../lib/workflow-flight.js";

test("only confirmed work-data stages add the optional node", () => {
  assert.deepEqual(visibleWorkflowNodes(["sending", "access"]).map((node) => node.id), ["sending", "access", "backend", "stream"]);
  assert.deepEqual(visibleWorkflowNodes(["sending", "access", "hubstaff"]).map((node) => node.id), ["sending", "access", "hubstaff", "backend", "stream"]);
  assert.equal(workflowNodeForStage("context"), "access");
  assert.equal(workflowNodeForStage("ready"), "backend");
});

test("paper keyframes follow the same responsive curved path as the connector", () => {
  for (const width of [210, 680]) {
    const start = workflowNodePoint("access", width);
    const end = workflowNodePoint("backend", width);
    const curve = workflowCurve(start, end, 0);
    const middle = workflowCurvePoint(curve, .5);
    const keyframes = workflowFlightKeyframes(curve);
    assert.ok(start.x > 0 && end.x < width);
    assert.ok(middle.y < start.y, "the route must arc upward");
    assert.match(workflowCurvePath(curve), /^M .* C /);
    assert.equal(keyframes.length, 16);
    assert.equal(keyframes[0].opacity, 0);
    assert.equal(keyframes.at(-1).opacity, 0);
    assert.match(keyframes[0].transform, new RegExp(`translate\\(${(start.x - 14).toFixed(1)}px`));
    assert.match(keyframes.at(-1).transform, new RegExp(`translate\\(${(end.x - 14).toFixed(1)}px`));
  }
});

test("batched stages land at the portal before proceeding to the AI service", () => {
  const steps = ["sending", "access", "context", "backend", "ready"];
  assert.deepEqual(pendingWorkflowHops(steps), ["access", "backend"]);
  assert.deepEqual(pendingWorkflowHops(steps, "access"), ["backend"]);
  assert.deepEqual(pendingWorkflowHops(steps, "backend"), []);
  assert.deepEqual(pendingWorkflowHops([...steps, "hubstaff", "stream"]), ["access", "hubstaff", "backend", "stream"]);
  assert.deepEqual(pendingWorkflowHops(["sending"]), []);
});

test("stale stages cannot move a new request and cancellation is not success", () => {
  const store = createClientAiWorkflowStore();
  const oldId = store.start("work");
  store.advance(oldId, "access");
  store.finish(oldId, "cancelled");
  assert.equal(store.getSnapshot().outcome, "cancelled");
  assert.equal(store.getSnapshot().steps.includes("complete"), false);

  const newId = store.start("general");
  store.advance(oldId, "backend");
  assert.deepEqual(store.getSnapshot().steps, ["sending"]);
  store.finish(oldId, "complete");
  assert.equal(store.getSnapshot().closing, false);
  store.finish(newId, "complete");
  assert.equal(store.getSnapshot().steps.at(-1), "complete");
});
