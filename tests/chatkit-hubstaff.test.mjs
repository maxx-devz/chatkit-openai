import test from "node:test";
import assert from "node:assert/strict";

import {
  chatKitInputText,
  hubstaffContextQuery,
  hubstaffMetricsRequested,
  hubstaffTaskDetailsRequested,
  hubstaffTaskReferences,
} from "../lib/chatkit-hubstaff.js";

function message(text, type = "threads.add_user_message") {
  return {
    type,
    params: {
      input: {
        content: [{ type: "input_text", text }],
        attachments: [],
        inference_options: {},
      },
    },
  };
}

test("ordinary chat does not wait for Hubstaff", () => {
  assert.equal(hubstaffContextQuery(message("Who are you?")), null);
  assert.equal(hubstaffContextQuery(message("Help me draft an email.")), null);
  assert.equal(hubstaffContextQuery({ type: "threads.list", params: {} }), null);
});

test("Hubstaff, time, and task questions request client-specific context", () => {
  for (const text of [
    "What is our Hubstaff status?",
    "How many hours are remaining?",
    "Which tasks are in progress?",
    "What work was completed this month?",
    "Are there blockers in project progress?",
  ]) {
    assert.equal(hubstaffContextQuery(message(text)), text);
  }
});

test("only task questions request the slower task detail endpoint", () => {
  assert.equal(hubstaffTaskDetailsRequested("How many hours are remaining?"), false);
  assert.equal(hubstaffTaskDetailsRequested("What is the current budget?"), false);
  assert.equal(hubstaffTaskDetailsRequested("Which tasks are for review?"), true);
  assert.equal(hubstaffTaskDetailsRequested(""), true);
});

test("task-only questions skip unrelated time and budget metrics", () => {
  assert.equal(hubstaffMetricsRequested("Tell me about this task"), false);
  assert.equal(hubstaffMetricsRequested("What is in Ideas / Someday?"), false);
  assert.equal(hubstaffMetricsRequested("How many hours are available left?"), true);
  assert.equal(hubstaffMetricsRequested("What is the remaining budget?"), true);
});

test("message extraction includes quoted context and stays bounded", () => {
  const payload = message("What about this?");
  payload.params.input.quoted_text = "Hubstaff hours remaining";
  assert.equal(chatKitInputText(payload), "What about this?\nHubstaff hours remaining");
  assert.match(hubstaffContextQuery(payload), /Hubstaff hours remaining/);
});

test("extracts and bounds canonical Hubstaff task references", () => {
  const query = [
    "Check https://tasks.hubstaff.com/app/organizations/14952/projects/346902/tasks/17694083",
    "and https://tasks.hubstaff.com/app/organizations/14952/projects/346902/tasks/17694083/",
    "not https://example.com/app/organizations/14952/projects/346902/tasks/99",
  ].join(" ");
  assert.deepEqual(hubstaffTaskReferences(query), [{
    organizationId: 14952,
    projectId: 346902,
    taskId: 17694083,
    url: "https://tasks.hubstaff.com/app/organizations/14952/projects/346902/tasks/17694083",
  }]);
});
