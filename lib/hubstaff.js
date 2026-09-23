import "server-only";

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
  resolveMonthlyHoursLimit,
  sumTrackedSeconds,
  taskSummary,
  titleCase,
} from "./hubstaff-data.js";
import { getHubstaffPatAccessToken } from "./hubstaff-auth.js";

const HUBSTAFF_API_BASE = "https://api.hubstaff.com";
const HUBSTAFF_TASKS_API_BASE = "https://tasks.hubstaff.com/api";
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

async function getAccessToken() {
  const directToken = process.env.HUBSTAFF_ACCESS_TOKEN?.trim() || "";
  const patRefreshToken = process.env.HUBSTAFF_PAT_REFRESH_TOKEN?.trim() || "";

  // Prefer a scoped PAT when both credential types are configured. PAT access
  // tokens can cover both Hubstaff API v2 and the separate Hubstaff Tasks API,
  // whereas an hsoat_ organization token may be rejected by the Tasks API.
  // Hubstaff initially supplies a PAT refresh token, so exchange and rotate it
  // instead of treating that initial value as a bearer token.
  if (patRefreshToken) {
    try {
      return await getHubstaffPatAccessToken();
    } catch (error) {
      throw hubstaffError(
        error?.hubstaffAuthCode || "hubstaff_pat_failed",
        error?.message || "Hubstaff PAT authentication could not be completed.",
        503,
      );
    }
  }

  // An organization token is the fallback for direct API v2 projects when no
  // scoped PAT has been configured.
  if (directToken.startsWith("hsoat_")) return directToken;

  // This also supports a manually exchanged PAT access token, although it
  // expires and should be replaced by HUBSTAFF_PAT_REFRESH_TOKEN for Vercel.
  if (directToken) return directToken;

  if (!directToken) {
    throw hubstaffError(
      "hubstaff_not_configured",
      "Hubstaff sync is not configured yet. Add HUBSTAFF_PAT_REFRESH_TOKEN for member access or HUBSTAFF_ACCESS_TOKEN for an organization token.",
      503,
    );
  }
}

async function hubstaffRequest(path, searchParams, { token, baseUrl = HUBSTAFF_API_BASE } = {}) {
  const bearerToken = token || await getAccessToken();
  const url = new URL(`${baseUrl}${path}`);
  if (searchParams) {
    for (const [key, value] of searchParams.entries()) url.searchParams.append(key, value);
  }

  let response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearerToken}`,
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
    const message = response.status === 401 && baseUrl === HUBSTAFF_TASKS_API_BASE
      ? "Hubstaff Tasks rejected this PAT. Create a new personal access token with both hubstaff:read and tasks:read scopes."
      : response.status === 401 && providerCode === "invalid_token"
        ? "Hubstaff rejected the access token. If you created a personal access token, put its initial value in HUBSTAFF_PAT_REFRESH_TOKEN so the portal can exchange and refresh it automatically."
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

function normalizedProjectName(value) {
  return String(value || "").trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

function projectNameMatchScore(left, right) {
  const candidate = normalizedProjectName(left);
  const target = normalizedProjectName(right);
  if (!candidate || !target) return 0;
  if (candidate === target) return 10_000;

  // Hubstaff Tasks and Time Tracking use separate project IDs and often use
  // slightly different display names. Prefer a clear suffix/prefix alias such
  // as "Monthly / Church Banners" over a looser substring match such as
  // "Digital Marketing Monthly / Church Banners (DM)".
  const separators = [" / ", " - ", " — ", ": "];
  if (separators.some((separator) => (
    candidate.endsWith(`${separator}${target}`)
    || candidate.startsWith(`${target}${separator}`)
  ))) {
    return 8_000 - Math.min(candidate.length - target.length, 1_000);
  }

  if (candidate.includes(target)) {
    return 1_000 - Math.min(candidate.length - target.length, 999);
  }

  return 0;
}

async function listTrackingProjects(organizationId, token) {
  const projects = [];
  let pageStartId = "";

  // Hubstaff caps each response at 100 projects. Larger organizations need
  // every page searched because a Tasks project ID cannot be used directly in
  // the Time Tracking API namespace.
  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ page_limit: "100", status: "all" });
    if (pageStartId) params.set("page_start_id", pageStartId);
    const payload = await hubstaffRequest(
      `/v2/organizations/${organizationId}/projects`,
      params,
      { token },
    );
    const pageProjects = Array.isArray(payload?.projects) ? payload.projects : [];
    projects.push(...pageProjects);

    const nextPageStartId = String(payload?.pagination?.next_page_start_id || "");
    if (!nextPageStartId || nextPageStartId === pageStartId || !pageProjects.length) break;
    pageStartId = nextPageStartId;
  }

  return projects;
}

async function listProjectMembers(projectId, token) {
  const members = [];
  let pageStartId = "";

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams({ page_limit: "100" });
    if (pageStartId) params.set("page_start_id", pageStartId);
    const payload = await hubstaffRequest(
      `/v2/projects/${projectId}/members`,
      params,
      { token },
    );
    const pageMembers = Array.isArray(payload?.members) ? payload.members : [];
    members.push(...pageMembers);

    const nextPageStartId = String(payload?.pagination?.next_page_start_id || "");
    if (!nextPageStartId || nextPageStartId === pageStartId || !pageMembers.length) break;
    pageStartId = nextPageStartId;
  }

  return { members };
}

async function resolveTrackingProject(project, token) {
  try {
    const payload = await hubstaffRequest(`/v2/projects/${project.projectId}`, undefined, { token });
    return {
      trackingProjectId: project.projectId,
      projectPayload: payload,
      source: "time_tracking_url",
    };
  } catch (error) {
    if (error?.publicDetails?.httpStatus !== 404) throw error;
  }

  // A tasks.hubstaff.com URL contains a Hubstaff Tasks project ID, which is a
  // different namespace from the Hubstaff Time Tracking project ID needed for
  // activity and budget endpoints. Resolve the linked project by its name among
  // the time-tracking organizations this member can access.
  const tasksPayload = await hubstaffRequest(
    `/v1/projects/${project.projectId}`,
    undefined,
    { token, baseUrl: HUBSTAFF_TASKS_API_BASE },
  );
  const tasksProject = tasksPayload?.project;
  const tasksProjectName = typeof tasksProject?.name === "string"
    ? tasksProject.name.trim()
    : "";
  if (!tasksProjectName) {
    throw hubstaffError(
      "hubstaff_tasks_project_invalid",
      "Hubstaff Tasks returned an incomplete project record.",
      502,
    );
  }

  let matches = [];
  try {
    matches = (await listTrackingProjects(project.organizationId, token))
      .map((candidate) => ({
        ...candidate,
        portalNameMatchScore: projectNameMatchScore(candidate?.name, tasksProjectName),
      }))
      .filter((candidate) => candidate.portalNameMatchScore > 0);
  } catch (error) {
    if (error?.publicDetails?.httpStatus !== 404 && error?.publicDetails?.httpStatus !== 403) {
      throw error;
    }
  }

  if (!matches.length) {
    const organizationsPayload = await hubstaffRequest(
      "/v2/organizations",
      new URLSearchParams({ page_limit: "100" }),
      { token },
    );
    const organizations = Array.isArray(organizationsPayload?.organizations)
      ? organizationsPayload.organizations.slice(0, 25)
      : [];
    const projectLists = await Promise.allSettled(
      organizations
        .filter((organization) => Number.isSafeInteger(Number(organization?.id)))
        .map(async (organization) => ({
          organizationId: Number(organization.id),
          projects: await listTrackingProjects(Number(organization.id), token),
        })),
    );
    matches = projectLists.flatMap((result) => result.status === "fulfilled"
      ? result.value.projects
          .map((candidate) => ({
            ...candidate,
            organization_id: result.value.organizationId,
            portalNameMatchScore: projectNameMatchScore(candidate?.name, tasksProjectName),
          }))
          .filter((candidate) => candidate.portalNameMatchScore > 0)
      : []);
  }

  const uniqueMatches = [...new Map(matches.map((candidate) => [Number(candidate.id), candidate])).values()];
  const bestScore = Math.max(0, ...uniqueMatches.map((candidate) => candidate.portalNameMatchScore || 0));
  const bestMatches = uniqueMatches.filter((candidate) => candidate.portalNameMatchScore === bestScore);
  if (bestMatches.length !== 1) {
    throw hubstaffError(
      bestMatches.length ? "hubstaff_project_ambiguous" : "hubstaff_tracking_project_not_found",
      bestMatches.length
        ? `More than one accessible time-tracking project is named "${tasksProjectName}". Connect the direct Hubstaff Time Tracking project URL in Admin.`
        : `The Hubstaff Tasks project "${tasksProjectName}" is accessible, but no matching Hubstaff Time Tracking project was found for this member.`,
      404,
    );
  }

  const trackingProject = bestMatches[0];
  return {
    trackingProjectId: Number(trackingProject.id),
    projectPayload: { project: trackingProject },
    source: "tasks_name_match",
  };
}

export async function loadHubstaffProject(value, {
  monthlyHoursLimit = null,
  includeTasks = true,
} = {}) {
  const project = parseHubstaffProjectUrl(value);
  if (!project) return { configured: false };
  const token = await getAccessToken();
  const resolvedProject = await resolveTrackingProject(project, token);
  const trackingProjectId = resolvedProject.trackingProjectId;

  const range = monthDateRange(new Date(), process.env.HUBSTAFF_REPORT_TIME_ZONE);
  const taskParams = new URLSearchParams();
  taskParams.set("page_limit", "100");
  taskParams.append("status[]", "active");
  taskParams.append("status[]", "completed");

  const activityParams = new URLSearchParams();
  activityParams.set("page_limit", "100");
  activityParams.set("date[start]", range.start);
  activityParams.set("date[stop]", range.stop);

  const [projectResult, tasksResult, activityResult, budgetResult, membersResult] = await Promise.allSettled([
    Promise.resolve(resolvedProject.projectPayload),
    includeTasks
      ? hubstaffRequest(`/v2/projects/${trackingProjectId}/tasks`, taskParams, { token })
      : Promise.resolve(null),
    hubstaffRequest(`/v2/projects/${trackingProjectId}/activities/daily`, activityParams, { token }),
    hubstaffRequest(`/v2/projects/${trackingProjectId}/budget_histories`, new URLSearchParams({ page_limit: "100" }), { token }),
    listProjectMembers(trackingProjectId, token),
  ]);

  const projectPayload = projectResult.status === "fulfilled" ? projectResult.value : {};
  const taskPayload = tasksResult.status === "fulfilled" ? tasksResult.value : {};
  const activityPayload = activityResult.status === "fulfilled" ? activityResult.value : {};
  const budgetPayload = budgetResult.status === "fulfilled" ? budgetResult.value : {};
  const membersPayload = membersResult.status === "fulfilled" ? membersResult.value : {};
  const upstreamError = [projectResult, tasksResult, activityResult, budgetResult]
    .find((result) => result.status === "rejected")?.reason;

  // Do not show stale or fabricated data if Hubstaff has rejected every
  // request. A partial response is useful while an individual endpoint is
  // unavailable, and the client will retry on its next poll.
  if (
    projectResult.status === "rejected"
    && (!includeTasks || tasksResult.status === "rejected")
    && activityResult.status === "rejected"
    && budgetResult.status === "rejected"
  ) {
    throw upstreamError;
  }

  const rawTasks = Array.isArray(taskPayload?.tasks) ? taskPayload.tasks : [];
  const rawActivities = Array.isArray(activityPayload?.daily_activities)
    ? activityPayload.daily_activities
    : Array.isArray(activityPayload?.activities)
      ? activityPayload.activities
      : [];
  const tasks = rawTasks
    .map((task) => normalizeHubstaffTask(task, trackingProjectId))
    .filter(Boolean)
    .slice(0, 200);
  const activityAvailable = activityResult.status === "fulfilled";
  const tasksAvailable = includeTasks && tasksResult.status === "fulfilled";
  const hoursUsed = activityAvailable ? sumTrackedSeconds(activityPayload) / 3600 : null;
  const currentBudget = currentHoursBudget(budgetPayload, range.stop);
  const costBudget = currentCostBudget(budgetPayload, range.stop);
  const costBudgetTime = deriveCostBudgetRemainingTime(costBudget, projectPayload, membersPayload);
  const hoursLimit = resolveMonthlyHoursLimit(
    projectPayload,
    monthlyHoursLimit,
  );
  const effectiveLimit = currentBudget?.limit ?? hoursLimit.value;
  const hoursRemaining = currentBudget
    ? currentBudget.remaining
    : effectiveLimit === null || hoursUsed === null
      ? null
      : Math.max(0, effectiveLimit - hoursUsed);
  const hoursOver = currentBudget
    ? currentBudget.over
    : effectiveLimit === null || hoursUsed === null
      ? null
      : Math.max(0, hoursUsed - effectiveLimit);
  const projectName = typeof projectPayload?.project?.name === "string"
    && projectPayload.project.name.trim()
    ? projectPayload.project.name.trim().slice(0, 160)
    : `Hubstaff project ${project.projectId}`;

  return {
    configured: true,
    available: true,
    project: {
      id: project.projectId,
      trackingProjectId,
      organizationId: project.organizationId,
      name: projectName,
      url: project.url,
      status: typeof projectPayload?.project?.status === "string"
        ? projectPayload.project.status
        : "active",
    },
    hours: {
      used: hoursUsed === null ? null : Math.round(hoursUsed * 100) / 100,
      limit: effectiveLimit,
      limitSource: currentBudget ? "hubstaff_budget_history" : hoursLimit.source,
      budgetSpent: currentBudget?.spent ?? null,
      budgetRecurrence: currentBudget?.recurrence || "monthly",
      budgetPeriodStart: currentBudget?.periodStart || range.start,
      budgetPeriodEnd: currentBudget?.periodEnd || range.stop,
      remaining: hoursRemaining === null ? null : Math.round(hoursRemaining * 100) / 100,
      over: hoursOver === null ? null : Math.round(hoursOver * 100) / 100,
    },
    costBudget: costBudget ? {
      ...costBudget,
      ...costBudgetTime,
      currency: costBudgetTime?.currency || "USD",
    } : null,
    tasks,
    taskSummary: tasksAvailable ? taskSummary(tasks, range) : null,
    source: {
      fetchedAt: new Date().toISOString(),
      monthStart: range.start,
      monthEnd: range.stop,
      timeZone: range.timeZone,
      tasksLimited: includeTasks && Boolean(taskPayload?.pagination?.next_page_start_id),
      tasksDeferred: !includeTasks,
      activityLimited: rawActivities.length >= 100,
      activityAvailable,
      tasksAvailable,
      partial: projectResult.status !== "fulfilled"
        || (includeTasks && tasksResult.status !== "fulfilled")
        || activityResult.status !== "fulfilled"
        || budgetResult.status !== "fulfilled",
      warning: upstreamError?.message || "",
      projectResolution: resolvedProject.source,
    },
  };
}

function tasksProject(value) {
  const project = parseHubstaffProjectUrl(value);
  if (!project) {
    throw hubstaffError("hubstaff_not_configured", "Connect a Hubstaff Tasks project in Admin.", 400);
  }
  if (new URL(project.url).hostname !== "tasks.hubstaff.com") {
    throw hubstaffError(
      "hubstaff_tasks_project_required",
      "This workflow view requires the client’s tasks.hubstaff.com project URL in Admin.",
      400,
    );
  }
  return project;
}

export async function loadHubstaffWorkflow(value) {
  const project = tasksProject(value);
  const token = await getAccessToken();
  const payload = await hubstaffRequest(
    `/v1/projects/${project.projectId}/lists`,
    new URLSearchParams({ page_limit: "100", removed: "false" }),
    { token, baseUrl: HUBSTAFF_TASKS_API_BASE },
  );
  const columns = (Array.isArray(payload?.lists) ? payload.lists : [])
    .map(normalizeHubstaffWorkflowList)
    .filter(Boolean)
    .sort((first, second) => first.position - second.position || first.name.localeCompare(second.name));
  return {
    configured: true,
    available: true,
    project: {
      id: project.projectId,
      organizationId: project.organizationId,
      url: project.url,
    },
    columns,
    source: {
      fetchedAt: new Date().toISOString(),
      truncated: Boolean(payload?.pagination?.next_page_start_id),
    },
  };
}

export async function loadHubstaffWorkflowTasks(value, listIdValue) {
  const project = tasksProject(value);
  const listId = Number(listIdValue);
  if (!Number.isSafeInteger(listId) || listId <= 0) {
    throw hubstaffError("invalid_hubstaff_list", "Select a valid Hubstaff workflow column.", 400);
  }

  const token = await getAccessToken();
  const listPayload = await hubstaffRequest(
    `/v1/lists/${listId}`,
    undefined,
    { token, baseUrl: HUBSTAFF_TASKS_API_BASE },
  );
  const list = normalizeHubstaffWorkflowList(listPayload?.list);
  if (!list || Number(listPayload?.list?.project_id) !== project.projectId) {
    throw hubstaffError(
      "hubstaff_list_forbidden",
      "That Hubstaff column does not belong to this client’s project.",
      403,
    );
  }

  const payload = await hubstaffRequest(
    `/v1/lists/${listId}/tasks`,
    new URLSearchParams({ page_limit: "100", removed: "false" }),
    { token, baseUrl: HUBSTAFF_TASKS_API_BASE },
  );
  const range = monthDateRange(new Date(), process.env.HUBSTAFF_REPORT_TIME_ZONE);
  const stage = hubstaffWorkflowStage(list.name, list.type);
  const rawTasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
  const visibleTasks = rawTasks.filter((task) => {
    if (stage !== "done") return task?.done !== true;
    const doneAt = typeof task?.done_at === "string" ? task.done_at.slice(0, 10) : "";
    return doneAt && doneAt >= range.start && doneAt <= range.stop;
  });
  const tasks = visibleTasks
    .sort((first, second) => stage === "done"
      ? String(second?.done_at || "").localeCompare(String(first?.done_at || ""))
      : Number(first?.position || 0) - Number(second?.position || 0))
    .map((task) => normalizeHubstaffWorkflowTask(task, project))
    .filter(Boolean);

  return {
    configured: true,
    available: true,
    list,
    tasks,
    source: {
      fetchedAt: new Date().toISOString(),
      monthStart: range.start,
      monthEnd: range.stop,
      truncated: Boolean(payload?.pagination?.next_page_start_id),
    },
  };
}

export async function loadHubstaffAssistantSnapshot(value, options) {
  if (!parseHubstaffProjectUrl(value)) return null;
  try {
    return buildHubstaffAssistantSnapshot(await loadHubstaffProject(value, options));
  } catch {
    return buildHubstaffAssistantSnapshot({ configured: true, available: false });
  }
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
