const MONTHLY_LIMIT_MAX = 100_000;

export function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

export function optionalMonthlyHours(value) {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result > 0 && result <= MONTHLY_LIMIT_MAX
    ? Math.round(result * 100) / 100
    : null;
}

export function normalizeReportTimeZone(value) {
  const timeZone = typeof value === "string" && value.trim() ? value.trim() : "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "UTC";
  }
}

export function monthDateRange(now = new Date(), timeZone = "UTC") {
  const resolvedTimeZone = normalizeReportTimeZone(timeZone);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: resolvedTimeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now).map(({ type, value }) => [type, value]),
  );
  return {
    start: `${parts.year}-${parts.month}-01`,
    stop: `${parts.year}-${parts.month}-${parts.day}`,
    timeZone: resolvedTimeZone,
  };
}

export function titleCase(value) {
  return String(value || "")
    .replaceAll("_", " ")
    .replaceAll("-", " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function taskColumn(task) {
  const metadata = task?.metadata && typeof task.metadata === "object"
    ? task.metadata
    : {};
  const metadataValue = [
    metadata.list_name,
    metadata.column_name,
    metadata.status_name,
    metadata.list,
    metadata.column,
  ].find((value) => typeof value === "string" && value.trim());

  if (metadataValue) return metadataValue.trim().slice(0, 60);
  if (String(task?.status).toLowerCase() === "completed") return "Done";
  return "To do";
}

function taskStage(task, column) {
  if (String(task?.status).toLowerCase() === "completed") return "done";
  const value = String(column || "").toLowerCase();
  if (/\b(done|complete|completed|closed|resolved)\b/.test(value)) return "done";
  if (/\b(in progress|progress|doing|working|review|testing|qa|blocked)\b/.test(value)) {
    return "in_progress";
  }
  return "todo";
}

export function sanitizeHubstaffTaskDescription(value) {
  return String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\[([^\]]+)\]\(https?:\/\/[^)\s]+\)/gi, "$1 [external link omitted]")
    .replace(/https?:\/\/[^\s)]+/gi, "[external link omitted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email omitted]")
    .replace(/\b(username|user name|login|password|passcode|pwd|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|secret)\b\s*[:=]\s*[^\r\n]+/gi,
      "$1: [sensitive value omitted]")
    .replace(/\b[A-Za-z0-9_-]{32,}\b/g, "[sensitive token omitted]")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, 500);
}

const HUBSTAFF_PRIORITY_LEVELS = new Map([
  ["critical", { level: "urgent", rank: 0 }],
  ["urgent", { level: "urgent", rank: 0 }],
  ["highest", { level: "urgent", rank: 0 }],
  ["p0", { level: "urgent", rank: 0 }],
  ["high", { level: "high", rank: 1 }],
  ["p1", { level: "high", rank: 1 }],
  ["medium", { level: "medium", rank: 2 }],
  ["normal", { level: "medium", rank: 2 }],
  ["p2", { level: "medium", rank: 2 }],
  ["low", { level: "low", rank: 3 }],
  ["lowest", { level: "low", rank: 3 }],
  ["p3", { level: "low", rank: 3 }],
  ["p4", { level: "low", rank: 3 }],
]);

function hubstaffPriorityLevel(name) {
  const normalized = String(name || "")
    .toLowerCase()
    .replace(/[\[\]()_:.-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^priority\s+/, "")
    .replace(/\s+priority$/, "");
  return HUBSTAFF_PRIORITY_LEVELS.get(normalized) || null;
}

export function resolveHubstaffTaskPriority(task, labels, projectId) {
  const labelIds = new Set((Array.isArray(task?.label_ids) ? task.label_ids : [])
    .map(Number)
    .filter((id) => Number.isSafeInteger(id) && id > 0));
  if (!labelIds.size || !Array.isArray(labels)) return null;

  const expectedProjectId = Number(projectId);
  const candidates = labels.flatMap((label) => {
    const id = Number(label?.id);
    const labelProjectId = Number(label?.project_id);
    const name = typeof label?.name === "string"
      ? label.name.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 40)
      : "";
    const priority = hubstaffPriorityLevel(name);
    if (!labelIds.has(id) || !name || !priority
      || !Number.isSafeInteger(expectedProjectId) || expectedProjectId <= 0
      || labelProjectId !== expectedProjectId) return [];
    return [{ name, level: priority.level, rank: priority.rank, id }];
  });
  candidates.sort((first, second) => first.rank - second.rank || first.id - second.id);
  const priority = candidates[0];
  return priority ? { name: priority.name, level: priority.level } : null;
}

export function normalizeHubstaffTask(task, projectId) {
  if (!task || !Number.isSafeInteger(Number(task.id))) return null;
  const status = typeof task.status === "string" ? task.status : "active";
  const column = taskColumn(task);
  const stage = taskStage(task, column);
  return {
    id: String(task.id),
    projectId,
    title: typeof task.summary === "string" && task.summary.trim()
      ? task.summary.trim().slice(0, 240)
      : "Untitled task",
    details: sanitizeHubstaffTaskDescription(task.details),
    status: status.slice(0, 60),
    column,
    stage,
    completed: stage === "done",
    completedAt: typeof task.completed_at === "string" ? task.completed_at : "",
    updatedAt: typeof task.updated_at === "string" ? task.updated_at : "",
    dueAt: typeof task.due_at === "string" ? task.due_at : "",
  };
}

export function hubstaffWorkflowStage(name, type = "") {
  const value = `${name || ""} ${type || ""}`.toLowerCase().replace(/[_-]+/g, " ");
  if (/\b(done|completed|complete|finished|closed|resolved|shipped)\b/.test(value)) return "done";
  if (/\b(client review|review|approval|approve|feedback|qa|quality assurance|testing)\b/.test(value)) return "review";
  if (/\b(in\s*progress|progress|doing|working|wip|development|implementing)\b/.test(value)) return "in_progress";
  if (/\b(to\s*do(?:['’]?s)?|up next|backlog|queue|planned|planning|new)\b/.test(value)) return "todo";
  return "other";
}

export function normalizeHubstaffWorkflowList(list) {
  if (!list || !Number.isSafeInteger(Number(list.id))) return null;
  const name = typeof list.name === "string" && list.name.trim()
    ? list.name.trim().slice(0, 100)
    : "Untitled column";
  const type = typeof list.type === "string" ? list.type.trim().slice(0, 40) : "normal";
  return {
    id: String(list.id),
    name,
    position: Number.isFinite(Number(list.position)) ? Number(list.position) : 0,
    taskCount: Number.isFinite(Number(list.task_count)) ? Math.max(0, Number(list.task_count)) : 0,
    type,
    stage: hubstaffWorkflowStage(name, type),
  };
}

export function normalizeHubstaffWorkflowTask(task, project, labels = []) {
  if (!task || !Number.isSafeInteger(Number(task.id))) return null;
  const title = typeof task.subject === "string" && task.subject.trim()
    ? task.subject.trim().slice(0, 240)
    : "Untitled task";
  const organizationId = Number(project?.organizationId);
  const projectId = Number(project?.projectId);
  const taskId = Number(task.id);
  const priority = resolveHubstaffTaskPriority(task, labels, projectId);
  const href = Number.isSafeInteger(organizationId) && Number.isSafeInteger(projectId)
    ? `https://tasks.hubstaff.com/app/organizations/${organizationId}/projects/${projectId}/tasks/${taskId}`
    : "";
  return {
    id: String(taskId),
    title,
    description: sanitizeHubstaffTaskDescription(task.description),
    href,
    done: task.done === true,
    doneAt: typeof task.done_at === "string" ? task.done_at : "",
    createdAt: typeof task.created_at === "string" ? task.created_at : "",
    dueAt: typeof task.due_at === "string"
      ? task.due_at
      : typeof task.due_on === "string"
        ? task.due_on
        : "",
    updatedAt: typeof task.updated_at === "string" ? task.updated_at : "",
    assigneeIds: Array.isArray(task.assignee_ids)
      ? task.assignee_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
      : [],
    followerIds: Array.isArray(task.follower_ids)
      ? task.follower_ids.map(Number).filter((id) => Number.isSafeInteger(id) && id > 0)
      : [],
    ...(priority ? { priority } : {}),
  };
}

export function sumTrackedSeconds(payload) {
  const rows = Array.isArray(payload?.daily_activities)
    ? payload.daily_activities
    : Array.isArray(payload?.activities)
      ? payload.activities
      : [];
  return rows.reduce((total, row) => total + numeric(
    row?.tracked ?? row?.total_tracked ?? row?.tracked_seconds,
  ), 0);
}

export function resolveMonthlyHoursLimit(projectPayload, clientLimit) {
  const budget = projectPayload?.project?.budget;
  const budgetType = typeof budget?.type === "string" ? budget.type.toLowerCase() : "";
  const recurrence = typeof budget?.recurrence === "string"
    ? budget.recurrence.toLowerCase()
    : "";
  const budgetHours = optionalMonthlyHours(
    budget?.hours ?? projectPayload?.project?.budget_hours,
  );

  if (budgetHours && budgetType === "hours" && (!recurrence || recurrence === "monthly")) {
    return { value: budgetHours, source: "hubstaff_project_budget" };
  }

  const configuredClientLimit = optionalMonthlyHours(clientLimit);
  if (configuredClientLimit) {
    return { value: configuredClientLimit, source: "portal_client_limit" };
  }

  return { value: null, source: "unavailable" };
}

function dateOnly(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)
    ? value.slice(0, 10)
    : "";
}

export function currentHoursBudget(payload, today) {
  const histories = Array.isArray(payload?.budget_histories) ? payload.budget_histories : [];
  const active = histories
    .filter((history) => {
      const budget = history?.budget;
      const start = dateOnly(history?.start_date);
      const stop = dateOnly(history?.stop_date);
      return String(budget?.type).toLowerCase() === "hours"
        && optionalMonthlyHours(budget?.hours)
        && (!start || start <= today)
        && (!stop || stop >= today);
    })
    .sort((first, second) => dateOnly(second?.start_date).localeCompare(dateOnly(first?.start_date)))[0];

  if (!active) return null;
  const limit = optionalMonthlyHours(active.budget.hours);
  const spent = Math.round(numeric(active.spent) * 100) / 100;
  return {
    limit,
    spent,
    remaining: Math.round(Math.max(0, limit - spent) * 100) / 100,
    over: Math.round(Math.max(0, spent - limit) * 100) / 100,
    recurrence: typeof active.budget.recurrence === "string"
      ? active.budget.recurrence.toLowerCase()
      : "",
    periodStart: dateOnly(active.start_date),
    periodEnd: dateOnly(active.stop_date),
  };
}

export function currentCostBudget(payload, today) {
  const histories = Array.isArray(payload?.budget_histories) ? payload.budget_histories : [];
  const active = histories
    .filter((history) => {
      const budget = history?.budget;
      const start = dateOnly(history?.start_date);
      const stop = dateOnly(history?.stop_date);
      return String(budget?.type).toLowerCase() === "cost"
        && optionalMonthlyHours(budget?.cost)
        && (!start || start <= today)
        && (!stop || stop >= today);
    })
    .sort((first, second) => dateOnly(second?.start_date).localeCompare(dateOnly(first?.start_date)))[0];

  if (!active) return null;
  const limit = optionalMonthlyHours(active.budget.cost);
  const spent = Math.round(numeric(active.spent) * 100) / 100;
  return {
    limit,
    spent,
    remaining: Math.round(Math.max(0, limit - spent) * 100) / 100,
    over: Math.round(Math.max(0, spent - limit) * 100) / 100,
    recurrence: typeof active.budget.recurrence === "string"
      ? active.budget.recurrence.toLowerCase()
      : "",
    periodStart: dateOnly(active.start_date),
    periodEnd: dateOnly(active.stop_date),
  };
}

export function deriveCostBudgetRemainingTime(costBudget, projectPayload, memberPayload) {
  if (!costBudget || !Number.isFinite(Number(costBudget.remaining))) return null;
  const project = projectPayload?.project || {};
  const rateField = String(project?.budget?.rate || "bill_rate").toLowerCase() === "pay_rate"
    ? "pay_rate"
    : "bill_rate";
  const members = Array.isArray(memberPayload?.members) ? memberPayload.members : [];
  const deliveryRates = members
    .filter((member) => (
      String(member?.membership_status).toLowerCase() === "active"
      && String(member?.membership_role).toLowerCase() === "user"
    ))
    .map((member) => Number(member?.[rateField]))
    .filter((rate) => Number.isFinite(rate) && rate > 0);
  const uniqueDeliveryRates = [...new Set(deliveryRates.map((rate) => rate.toFixed(4)))].map(Number);
  const projectRate = Number(project?.[rateField]);
  const rate = uniqueDeliveryRates.length === 1
    ? uniqueDeliveryRates[0]
    : Number.isFinite(projectRate) && projectRate > 0
      ? projectRate
      : null;

  // A mixed-rate project has no single truthful hours conversion. In that
  // case the UI continues to show the monetary balance instead.
  if (!rate) return null;
  const remainingHours = Number(costBudget.remaining) / rate;
  const currency = members.find((member) => (
    String(member?.membership_status).toLowerCase() === "active"
    && String(member?.membership_role).toLowerCase() === "user"
    && typeof member?.currency === "string"
    && member.currency.trim()
  ))?.currency?.trim().toUpperCase() || "USD";

  return {
    remainingHours: Math.round(remainingHours * 10_000) / 10_000,
    // Floor the display value so the portal never overstates available time.
    remainingMinutes: Math.max(0, Math.floor(remainingHours * 60)),
    currency,
  };
}

function validDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? null : date;
}

export function taskSummary(tasks, range) {
  const completedThisMonth = tasks.filter((task) => {
    if (!task.completedAt) return false;
    const date = validDate(task.completedAt);
    return date && task.completedAt.slice(0, 10) >= range.start
      && task.completedAt.slice(0, 10) <= range.stop;
  }).length;
  return {
    total: tasks.length,
    todo: tasks.filter((task) => task.stage === "todo").length,
    inProgress: tasks.filter((task) => task.stage === "in_progress").length,
    done: tasks.filter((task) => task.stage === "done").length,
    completedThisMonth,
  };
}

export function buildHubstaffAssistantSnapshot(data) {
  if (!data?.configured) return null;
  if (!data.available) {
    return {
      configured: true,
      available: false,
      message: "Hubstaff data could not be refreshed for this request.",
    };
  }

  const tasks = [...(data.tasks || [])]
    .sort((first, second) => {
      const firstDate = first.completedAt || first.updatedAt || "";
      const secondDate = second.completedAt || second.updatedAt || "";
      return secondDate.localeCompare(firstDate);
    })
    .slice(0, 40)
    .map(({ id, title, details, href, status, column, stage, completedAt, createdAt, updatedAt, dueAt, priority,
      conversation, assignees, assigneeNamesAvailable, followers, followerNamesAvailable,
      completionAttribution }) => ({
      id, title, details, href, status, column, stage, completedAt, createdAt, updatedAt, dueAt,
      ...(priority ? { priority } : {}),
      ...(conversation ? { conversation } : {}),
      ...(Array.isArray(assignees) ? { assignees, assigneeNamesAvailable } : {}),
      ...(Array.isArray(followers) ? { followers, followerNamesAvailable } : {}),
      ...(completionAttribution ? { completionAttribution } : {}),
    }));

  return {
    configured: true,
    available: true,
    readOnly: true,
    project: data.project,
    hours: data.hours,
    costBudget: data.costBudget || null,
    taskSummary: data.taskSummary,
    tasks,
    source: {
      fetchedAt: data.source?.fetchedAt || "",
      monthStart: data.source?.monthStart || "",
      monthEnd: data.source?.monthEnd || "",
      timeZone: data.source?.timeZone || "UTC",
      partial: Boolean(data.source?.partial),
      tasksLimited: Boolean(data.source?.tasksLimited),
      activityLimited: Boolean(data.source?.activityLimited),
      activityAvailable: data.source?.activityAvailable !== false,
      tasksAvailable: data.source?.tasksAvailable !== false,
      activityDelayNotice: "Hubstaff activity totals can be delayed by up to 20 minutes.",
    },
  };
}
