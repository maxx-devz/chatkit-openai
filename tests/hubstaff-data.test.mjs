import test from "node:test";
import assert from "node:assert/strict";

import {
  buildHubstaffAssistantSnapshot,
  currentCostBudget,
  currentHoursBudget,
  deriveCostBudgetRemainingTime,
  hubstaffWorkflowStage,
  monthDateRange,
  normalizeHubstaffTask,
  normalizeHubstaffWorkflowList,
  normalizeHubstaffWorkflowTask,
  sanitizeHubstaffTaskDescription,
  resolveMonthlyHoursLimit,
  taskSummary,
} from "../lib/hubstaff-data.js";

test("uses the configured reporting timezone for month boundaries", () => {
  const instant = new Date("2026-08-31T16:30:00.000Z");
  assert.deepEqual(monthDateRange(instant, "Asia/Manila"), {
    start: "2026-09-01",
    stop: "2026-09-01",
    timeZone: "Asia/Manila",
  });
  assert.equal(monthDateRange(instant, "invalid/time-zone").timeZone, "UTC");
});

test("uses monthly Hubstaff hours before a client-specific limit", () => {
  const monthlyBudget = { project: { budget: { type: "hours", hours: 25, recurrence: "monthly" } } };
  assert.deepEqual(resolveMonthlyHoursLimit(monthlyBudget, 20), {
    value: 25,
    source: "hubstaff_project_budget",
  });
  const weeklyBudget = { project: { budget: { type: "hours", hours: 30, recurrence: "weekly" } } };
  assert.deepEqual(resolveMonthlyHoursLimit(weeklyBudget, 20), {
    value: 20,
    source: "portal_client_limit",
  });
  assert.deepEqual(resolveMonthlyHoursLimit({}, null), {
    value: null,
    source: "unavailable",
  });
});

test("derives conservative remaining minutes from a uniform project bill rate", () => {
  assert.deepEqual(deriveCostBudgetRemainingTime(
    { remaining: 12.09 },
    { project: { budget: { rate: "bill_rate" } } },
    { members: [
      { membership_status: "active", membership_role: "manager", bill_rate: "0.01", currency: "USD" },
      { membership_status: "active", membership_role: "user", bill_rate: "50.0", currency: "USD" },
      { membership_status: "active", membership_role: "user", bill_rate: "50.0", currency: "USD" },
    ] },
  ), {
    remainingHours: 0.2418,
    remainingMinutes: 14,
    currency: "USD",
  });
  assert.equal(deriveCostBudgetRemainingTime(
    { remaining: 12 },
    { project: { budget: { rate: "bill_rate" } } },
    { members: [
      { membership_status: "active", membership_role: "user", bill_rate: "40" },
      { membership_status: "active", membership_role: "user", bill_rate: "50" },
    ] },
  ), null);
});

test("uses Hubstaff's active budget history spent and remaining values", () => {
  const result = currentHoursBudget({ budget_histories: [
    {
      start_date: "2026-09-01",
      stop_date: "2026-09-30",
      spent: 6 / 60,
      budget: { type: "hours", hours: 40 + 25 / 60, recurrence: "monthly" },
    },
    {
      start_date: "2026-08-01",
      stop_date: "2026-08-31",
      spent: 20,
      budget: { type: "hours", hours: 40, recurrence: "monthly" },
    },
  ] }, "2026-09-10");
  assert.deepEqual(result, {
    limit: 40.42,
    spent: 0.1,
    remaining: 40.32,
    over: 0,
    recurrence: "monthly",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  });
});

test("keeps a cost budget separate from hour limits", () => {
  const result = currentCostBudget({ budget_histories: [
    {
      start_date: "2026-09-01",
      stop_date: "2026-09-30",
      spent: "2000.0",
      budget: { type: "cost", cost: 2000, recurrence: "monthly" },
    },
  ] }, "2026-09-23");
  assert.deepEqual(result, {
    limit: 2000,
    spent: 2000,
    remaining: 0,
    over: 0,
    recurrence: "monthly",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
  });
  assert.equal(currentHoursBudget({ budget_histories: [{
    start_date: "2026-09-01",
    stop_date: "2026-09-30",
    spent: 2000,
    budget: { type: "cost", cost: 2000, recurrence: "monthly" },
  }] }, "2026-09-23"), null);
});

test("normalizes tasks into todo, in-progress, and done stages", () => {
  const todo = normalizeHubstaffTask({ id: 1, summary: "Plan", status: "active" }, 7);
  const doing = normalizeHubstaffTask({
    id: 2,
    summary: "Build",
    status: "active",
    metadata: { column_name: "In progress" },
  }, 7);
  const done = normalizeHubstaffTask({
    id: 3,
    summary: "Ship",
    status: "completed",
    completed_at: "2026-09-01T03:00:00Z",
  }, 7);
  assert.equal(todo.stage, "todo");
  assert.equal(doing.stage, "in_progress");
  assert.equal(done.stage, "done");
  assert.deepEqual(taskSummary([todo, doing, done], {
    start: "2026-09-01",
    stop: "2026-09-10",
  }), { total: 3, todo: 1, inProgress: 1, done: 1, completedThisMonth: 1 });
});

test("classifies each client's workflow names without replacing their labels", () => {
  assert.equal(hubstaffWorkflowStage("TO-DO'S"), "todo");
  assert.equal(hubstaffWorkflowStage("DOING (IN PROGRESS)"), "in_progress");
  assert.equal(hubstaffWorkflowStage("FOR CLIENT'S REVIEW"), "review");
  assert.equal(hubstaffWorkflowStage("Delivered", "done"), "done");
  assert.equal(hubstaffWorkflowStage("Meetings"), "other");
  assert.deepEqual(normalizeHubstaffWorkflowList({
    id: 7,
    name: "For Client's Review",
    position: 3,
    task_count: 4,
    type: "normal",
  }), {
    id: "7",
    name: "For Client's Review",
    position: 3,
    taskCount: 4,
    type: "normal",
    stage: "review",
  });
});

test("creates tenant-scoped Hubstaff task links from normalized workflow tasks", () => {
  assert.deepEqual(normalizeHubstaffWorkflowTask({
    id: 44,
    subject: "Review landing page",
    description: "Client review",
    done: false,
    due_on: "2026-09-30",
    updated_at: "2026-09-20T10:00:00Z",
    assignee_ids: [7],
    follower_ids: [8, 9],
  }, { organizationId: 12, projectId: 34 }), {
    id: "44",
    title: "Review landing page",
    description: "Client review",
    href: "https://tasks.hubstaff.com/app/organizations/12/projects/34/tasks/44",
    done: false,
    doneAt: "",
    createdAt: "",
    dueAt: "2026-09-30",
    updatedAt: "2026-09-20T10:00:00Z",
    assigneeIds: [7],
    followerIds: [8, 9],
  });
});

test("assistant snapshots retain only verified assignee and follower display names", () => {
  const snapshot = buildHubstaffAssistantSnapshot({
    configured: true,
    available: true,
    project: { id: 7, name: "SPP", url: "https://tasks.hubstaff.com/app/organizations/1/projects/2" },
    hours: { used: null, limit: null, remaining: null, over: null },
    taskSummary: { total: 1, todo: 1, inProgress: 0, done: 0, completedThisMonth: 0 },
    tasks: [{
      id: "44", title: "Dev - Non-Blank Space", status: "active", column: "To-do's",
      stage: "todo", completedAt: "", createdAt: "", updatedAt: "", dueAt: "",
      assignees: ["Assigned Member"], assigneeNamesAvailable: true,
      followers: ["Following Member"], followerNamesAvailable: true,
      assigneeIds: [7], followerIds: [8],
    }],
    source: { fetchedAt: "2026-09-24T00:00:00Z", partial: false },
  });
  assert.deepEqual(snapshot.tasks[0].assignees, ["Assigned Member"]);
  assert.deepEqual(snapshot.tasks[0].followers, ["Following Member"]);
  assert.equal("assigneeIds" in snapshot.tasks[0], false);
  assert.equal("followerIds" in snapshot.tasks[0], false);
});

test("redacts sensitive task-description values and external contact links", () => {
  const value = sanitizeHubstaffTaskDescription(
    "See [brief](https://docs.example.com/private) or https://example.com/x\n"
      + "Email owner@example.com\npassword: do-not-share\nAPI_KEY = secret-value",
  );
  assert.equal(value.includes("https://"), false);
  assert.equal(value.includes("owner@example.com"), false);
  assert.equal(value.includes("do-not-share"), false);
  assert.equal(value.includes("secret-value"), false);
  assert.match(value, /external link omitted/);
  assert.match(value, /sensitive value omitted/);
});

test("assistant snapshot is read-only, bounded, and includes freshness metadata", () => {
  const tasks = Array.from({ length: 50 }, (_, index) => ({
    id: String(index + 1), title: `Task ${index + 1}`, status: "active", column: "To do",
    stage: "todo", completedAt: "", updatedAt: `2026-09-${String((index % 9) + 1).padStart(2, "0")}T00:00:00Z`, dueAt: "",
  }));
  const snapshot = buildHubstaffAssistantSnapshot({
    configured: true,
    available: true,
    project: { id: 7, name: "Golf Brands", url: "https://tasks.hubstaff.com/app/organizations/14952/projects/346902" },
    hours: { used: 3, limit: 10, remaining: 7, over: 0 },
    taskSummary: { total: 50, todo: 50, inProgress: 0, done: 0, completedThisMonth: 0 },
    tasks,
    source: { fetchedAt: "2026-09-10T00:00:00Z", monthStart: "2026-09-01", monthEnd: "2026-09-10", timeZone: "Asia/Manila", partial: false, tasksLimited: false },
  });
  assert.equal(snapshot.readOnly, true);
  assert.equal(snapshot.tasks.length, 40);
  assert.equal(snapshot.source.timeZone, "Asia/Manila");
  assert.equal(snapshot.taskSummary.total, 50);
});
