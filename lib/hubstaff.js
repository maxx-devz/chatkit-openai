import "server-only";

const HUBSTAFF_API_BASE = "https://api.hubstaff.com";
const ALLOWED_PROJECT_HOSTS = new Set([
  "tasks.hubstaff.com",
  "app.hubstaff.com",
]);

function hubstaffError(code, message, status = 503, data = {}) {
  return Object.assign(new Error(message), {
    publicDetails: { code, message, status, ...data },
  });
}

/**
 * Accept only a Hubstaff project URL. The numeric IDs are read server-side so
 * a client cannot choose a different project by editing a browser request.
 */
export function normalizeHubstaffProjectUrl(value) {
  const raw = typeof value === "string" ? value.trim() : "";
  if (!raw) return "";

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw hubstaffError(
      "invalid_hubstaff_project_url",
      "Enter a valid HTTPS Hubstaff project URL.",
      400,
    );
  }

  if (url.protocol !== "https:" || !ALLOWED_PROJECT_HOSTS.has(url.hostname.toLowerCase())) {
    throw hubstaffError(
      "invalid_hubstaff_project_url",
      "Hubstaff project URLs must use HTTPS and tasks.hubstaff.com (or app.hubstaff.com).",
      400,
    );
  }

  const match = url.pathname.match(/^\/app\/organizations\/(\d+)\/projects\/(\d+)\/?$/);
  if (!match) {
    throw hubstaffError(
      "invalid_hubstaff_project_url",
      "Use the Hubstaff project URL format: https://tasks.hubstaff.com/app/organizations/ORG_ID/projects/PROJECT_ID",
      400,
    );
  }

  return `https://tasks.hubstaff.com/app/organizations/${match[1]}/projects/${match[2]}`;
}

export function parseHubstaffProjectUrl(value) {
  const normalized = normalizeHubstaffProjectUrl(value);
  if (!normalized) return null;

  const match = normalized.match(/organizations\/(\d+)\/projects\/(\d+)$/);
  return match
    ? {
        url: normalized,
        organizationId: Number(match[1]),
        projectId: Number(match[2]),
      }
    : null;
}

function getAccessToken() {
  const token = process.env.HUBSTAFF_ACCESS_TOKEN?.trim();
  if (!token) {
    throw hubstaffError(
      "hubstaff_not_configured",
      "Hubstaff sync is not configured yet. Add HUBSTAFF_ACCESS_TOKEN to the server environment.",
      503,
    );
  }
  return token;
}

async function hubstaffRequest(path, searchParams) {
  const token = getAccessToken();
  const url = new URL(`${HUBSTAFF_API_BASE}${path}`);
  if (searchParams) {
    for (const [key, value] of searchParams.entries()) url.searchParams.append(key, value);
  }

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      cache: "no-store",
    });
  } catch (error) {
    throw hubstaffError(
      "hubstaff_unreachable",
      "Hubstaff could not be reached. The portal will try again automatically.",
      503,
      { cause: error?.message || "network_error" },
    );
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const providerCode = payload?.code
      || (typeof payload?.error === "string" ? payload.error : "");
    const providerErrorCode = payload?.error_code;
    const providerMessage = typeof payload?.error === "string" ? payload.error : "";
    const message = response.status === 401 && providerCode === "invalid_token"
      ? "Hubstaff rejected HUBSTAFF_ACCESS_TOKEN (invalid_token). Use a Hubstaff organization access token beginning with hsoat_; a personal-access-token JWT is a refresh token and cannot be sent directly."
      : providerMessage || `Hubstaff returned HTTP ${response.status}.`;

    throw hubstaffError(
      "hubstaff_request_failed",
      message,
      response.status === 401 || response.status === 403 ? 502 : response.status,
      {
        providerCode: providerCode ? String(providerCode).slice(0, 80) : "",
        providerErrorCode: providerErrorCode !== undefined
          && providerErrorCode !== null
          && String(providerErrorCode).trim() !== ""
          && Number.isInteger(Number(providerErrorCode))
          ? Number(providerErrorCode)
          : null,
        httpStatus: response.status,
      },
    );
  }

  return payload || {};
}

function numeric(value) {
  const result = Number(value);
  return Number.isFinite(result) && result >= 0 ? result : 0;
}

function dateRangeUtc() {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");
  return {
    start: `${year}-${month}-01`,
    stop: `${year}-${month}-${day}`,
  };
}

function titleCase(value) {
  return value
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
  return "In progress";
}

function normalizeTask(task, projectId) {
  if (!task || !Number.isSafeInteger(Number(task.id))) return null;
  const status = typeof task.status === "string" ? task.status : "active";
  const completed = status.toLowerCase() === "completed";
  return {
    id: String(task.id),
    projectId,
    title: typeof task.summary === "string" && task.summary.trim()
      ? task.summary.trim().slice(0, 240)
      : "Untitled task",
    details: typeof task.details === "string" ? task.details.trim().slice(0, 500) : "",
    status: status.slice(0, 60),
    column: taskColumn(task),
    completed,
    updatedAt: typeof task.updated_at === "string" ? task.updated_at : "",
    dueAt: typeof task.due_at === "string" ? task.due_at : "",
  };
}

function sumTrackedSeconds(payload) {
  const rows = Array.isArray(payload?.daily_activities)
    ? payload.daily_activities
    : Array.isArray(payload?.activities)
      ? payload.activities
      : [];
  return rows.reduce((total, row) => total + numeric(
    row?.tracked ?? row?.total_tracked ?? row?.tracked_seconds,
  ), 0);
}

function projectHoursLimit(projectPayload) {
  const budget = projectPayload?.project?.budget;
  const budgetType = typeof budget?.type === "string" ? budget.type.toLowerCase() : "";
  const recurrence = typeof budget?.recurrence === "string"
    ? budget.recurrence.toLowerCase()
    : "";
  const budgetHours = numeric(budget?.hours ?? projectPayload?.project?.budget_hours);

  // The dashboard card is explicitly monthly. Do not present a one-time or
  // weekly Hubstaff project budget as a monthly allowance by mistake.
  if (budgetHours > 0 && budgetType === "hours" && (!recurrence || recurrence === "monthly")) {
    return budgetHours;
  }

  const configuredDefault = numeric(process.env.HUBSTAFF_MONTHLY_HOURS_DEFAULT);
  return configuredDefault > 0 ? configuredDefault : null;
}

export async function loadHubstaffProject(value) {
  const project = parseHubstaffProjectUrl(value);
  if (!project) return { configured: false };

  const range = dateRangeUtc();
  const taskParams = new URLSearchParams();
  taskParams.set("page_limit", "100");
  taskParams.append("status[]", "active");
  taskParams.append("status[]", "completed");

  const activityParams = new URLSearchParams();
  activityParams.set("page_limit", "100");
  activityParams.set("date[start]", range.start);
  activityParams.set("date[stop]", range.stop);

  const [projectResult, tasksResult, activityResult] = await Promise.allSettled([
    hubstaffRequest(`/v2/projects/${project.projectId}`),
    hubstaffRequest(`/v2/projects/${project.projectId}/tasks`, taskParams),
    hubstaffRequest(`/v2/projects/${project.projectId}/activities/daily`, activityParams),
  ]);

  const projectPayload = projectResult.status === "fulfilled" ? projectResult.value : {};
  const taskPayload = tasksResult.status === "fulfilled" ? tasksResult.value : {};
  const activityPayload = activityResult.status === "fulfilled" ? activityResult.value : {};
  const upstreamError = [projectResult, tasksResult, activityResult]
    .find((result) => result.status === "rejected")?.reason;

  // Do not show stale or fabricated data if Hubstaff has rejected every
  // request. A partial response is useful while an individual endpoint is
  // unavailable, and the client will retry on its next poll.
  if (
    projectResult.status === "rejected"
    && tasksResult.status === "rejected"
    && activityResult.status === "rejected"
  ) {
    throw upstreamError;
  }

  const rawTasks = Array.isArray(taskPayload?.tasks) ? taskPayload.tasks : [];
  const tasks = rawTasks
    .map((task) => normalizeTask(task, project.projectId))
    .filter(Boolean)
    .slice(0, 200);
  const hoursUsed = sumTrackedSeconds(activityPayload) / 3600;
  const hoursLimit = projectHoursLimit(projectPayload);
  const hoursRemaining = hoursLimit === null
    ? null
    : Math.max(0, hoursLimit - hoursUsed);
  const projectName = typeof projectPayload?.project?.name === "string"
    && projectPayload.project.name.trim()
    ? projectPayload.project.name.trim().slice(0, 160)
    : `Hubstaff project ${project.projectId}`;

  return {
    configured: true,
    project: {
      id: project.projectId,
      organizationId: project.organizationId,
      name: projectName,
      url: project.url,
      status: typeof projectPayload?.project?.status === "string"
        ? projectPayload.project.status
        : "active",
    },
    hours: {
      used: Math.round(hoursUsed * 100) / 100,
      limit: hoursLimit === null ? null : Math.round(hoursLimit * 100) / 100,
      remaining: hoursRemaining === null ? null : Math.round(hoursRemaining * 100) / 100,
    },
    tasks,
    source: {
      fetchedAt: new Date().toISOString(),
      monthStart: range.start,
      partial: projectResult.status !== "fulfilled"
        || tasksResult.status !== "fulfilled"
        || activityResult.status !== "fulfilled",
      warning: upstreamError?.message || "",
    },
  };
}

export function hubstaffErrorResponse(error) {
  const details = error?.publicDetails || {
    code: "hubstaff_error",
    message: "Hubstaff data could not be loaded.",
    status: 503,
  };

  return Response.json(
    {
      error: details.message,
      code: details.code,
      ...(details.providerCode ? { providerCode: details.providerCode } : {}),
      ...(details.providerErrorCode !== null && details.providerErrorCode !== undefined
        ? { providerErrorCode: details.providerErrorCode }
        : {}),
      ...(details.httpStatus ? { upstreamStatus: details.httpStatus } : {}),
    },
    {
      status: details.status || 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}

export { titleCase };
