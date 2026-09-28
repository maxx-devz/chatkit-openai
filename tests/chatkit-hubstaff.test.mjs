import test from "node:test";
import assert from "node:assert/strict";

import {
  chatKitThreadId,
  chatKitInputText,
  hubstaffActivityAnalyticsRequested,
  hubstaffContextQuery,
  hubstaffConversationContextRequested,
  hubstaffCredentialAuditRequested,
  hubstaffMetricsRequested,
  hubstaffRankingLimit,
  hubstaffTaskDateRange,
  hubstaffTaskConversationRequested,
  hubstaffTaskPeopleRequested,
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
    "There was a person assign and followers who was them?",
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

test("current-conversation context resolves Hubstaff follow-up references", () => {
  const followUp = message("What about them?");
  followUp.params.thread_id = "thr_77d873cc454c4ed0941725f5bac10dac";
  assert.equal(hubstaffContextQuery(followUp), null);
  assert.equal(hubstaffConversationContextRequested(followUp), true);
  assert.equal(chatKitThreadId(followUp), "thr_77d873cc454c4ed0941725f5bac10dac");
  assert.match(
    hubstaffContextQuery(followUp, "User: Who is assigned to the Dev - Non-Blank Space task?"),
    /Dev - Non-Blank Space/,
  );
  assert.equal(chatKitThreadId({ params: { thread_id: "../another-client" } }), "");
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

test("extracts historical Hubstaff task ranges from natural-language dates", () => {
  const now = new Date("2026-09-24T03:00:00Z");
  assert.deepEqual(
    hubstaffTaskDateRange("Give me the last year task (2025 on November)", now, "Asia/Manila"),
    {
      start: "2025-11-01",
      stop: "2025-11-30",
      label: "November 2025",
      kind: "month",
    },
  );
  assert.deepEqual(
    hubstaffTaskDateRange("What was completed in March last year?", now, "Asia/Manila"),
    {
      start: "2025-03-01",
      stop: "2025-03-31",
      label: "March 2025",
      kind: "month",
    },
  );
  assert.deepEqual(
    hubstaffTaskDateRange("Show tasks from 2024", now, "UTC"),
    {
      start: "2024-01-01",
      stop: "2024-12-31",
      label: "2024",
      kind: "year",
    },
  );
  assert.equal(hubstaffTaskDateRange("Which tasks are in progress?", now, "UTC"), null);
  assert.deepEqual(
    hubstaffTaskDateRange("Show all history", now, "UTC"),
    {
      start: null,
      stop: "2026-09-24",
      label: "all available history",
      kind: "history",
      allHistory: true,
    },
  );
});

test("detects historical activity analytics and bounded ranking sizes", () => {
  assert.equal(hubstaffActivityAnalyticsRequested("Top 5 tasks by tracked hours in 2024"), true);
  assert.equal(hubstaffActivityAnalyticsRequested("List the lowest 5 tasks in all history"), true);
  assert.equal(hubstaffActivityAnalyticsRequested("Which tasks are in review?"), false);
  assert.equal(hubstaffRankingLimit("Give me the lowest 7 tasks"), 7);
  assert.equal(hubstaffRankingLimit("Give me the top 99 tasks"), 20);
});

test("detects credential audits and task conversation requests", () => {
  assert.equal(hubstaffCredentialAuditRequested("List tasks where credentials were shared"), true);
  assert.equal(hubstaffCredentialAuditRequested("What is the password?"), false);
  assert.equal(hubstaffTaskConversationRequested("Read the conversation on this task"), true);
  assert.equal(hubstaffTaskConversationRequested("What is this task?"), false);
  assert.equal(hubstaffTaskPeopleRequested("Who is assigned to this task?"), true);
  assert.equal(hubstaffTaskPeopleRequested("Who completed this task?"), true);
  assert.equal(hubstaffTaskPeopleRequested("There was a person assign and followers who was them?"), true);
});
