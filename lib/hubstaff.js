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
  numeric,
  resolveMonthlyHoursLimit,
  sanitizeHubstaffTaskDescription,
  sumTrackedSeconds,
  taskSummary,
  titleCase,
} from "./hubstaff-data.js";
import { getHubstaffPatAccessToken } from "./hubstaff-auth.js";
import {
  hubstaffActivityAnalyticsRequested,
  hubstaffCredentialAuditRequested,
  hubstaffRankingLimit,
  hubstaffTaskDetailsRequested,
  hubstaffTaskDateRange,
  hubstaffTaskConversationRequested,
  hubstaffTaskPeopleRequested,
  hubstaffMetricsRequested,
  hubstaffTaskReferences,
} from "./chatkit-hubstaff.js";

const HUBSTAFF_API_BASE = "https://api.hubstaff.com";
const HUBSTAFF_TASKS_API_BASE = "https://tasks.hubstaff.com/api";
const ALLOWED_PROJECT_HOSTS = new Set([
  "tasks.hubstaff.com",
  "app.hubstaff.com",
]);
const PROJECT_CACHE_TTL_MS = 30_000;
const PROJECT_CACHE_LIMIT = 100;
// The link between a Tasks project and its Time Tracking project is stable.
// Keep it much longer than live metrics so dashboard polls do not repeatedly
// scan every accessible v2 project.
const PROJECT_RESOLUTION_TTL_MS = 6 * 60 * 60_000;
const WORKFLOW_CACHE_TTL_MS = 30_000;
const PROJECT_MEMBER_CACHE_TTL_MS = 10 * 60_000;
const ASSISTANT_ANALYTICS_CACHE_TTL_MS = 5 * 60_000;
const CREDENTIAL_AUDIT_CACHE_TTL_MS = 5 * 60_000;
const CREDENTIAL_AUDIT_TASK_LIMIT = 250;
const projectCache = new Map();
const projectResolutionCache = new Map();
const integrationProjectLinkCache = new Map();
const projectMemberCache = new Map();
const trackingProjectCache = new Map();
const workflowCache = new Map();
const workflowOverviewCache = new Map();
const workflowTaskCache = new Map();
const assistantAnalyticsCache = new Map();
const credentialAuditCache = new Map();
const tasksProjectMemberCache = new Map();

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
      signal: AbortSignal.timeout(15_000),
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

async function cachedHubstaffResult(cache, key, loader, ttl = WORKFLOW_CACHE_TTL_MS) {
  const now = Date.now();
  const cached = cache.get(key);
  if (cached?.value && cached.expiresAt > now) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = loader();
  cache.set(key, { promise, value: null, expiresAt: 0 });
  try {
    const value = await promise;
    cache.set(key, { promise: null, value, expiresAt: Date.now() + ttl });
    while (cache.size > PROJECT_CACHE_LIMIT) cache.delete(cache.keys().next().value);
    return value;
  } catch (error) {
    cache.delete(key);
    throw error;
  }
}

async function listHubstaffTaskPages(path, initialParams, token, maxPages = 20) {
  const tasks = [];
  let pageStartId = "";
  let truncated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams(initialParams);
    if (pageStartId) params.set("page_start_id", pageStartId);
    const payload = await hubstaffRequest(path, params, {
      token,
      baseUrl: HUBSTAFF_TASKS_API_BASE,
    });
    const pageTasks = Array.isArray(payload?.tasks) ? payload.tasks : [];
    tasks.push(...pageTasks);

    const nextPageStartId = String(payload?.pagination?.next_page_start_id || "");
    if (!nextPageStartId || nextPageStartId === pageStartId || !pageTasks.length) {
      truncated = false;
      break;
    }
    pageStartId = nextPageStartId;
    truncated = page === maxPages - 1;
  }

  return { tasks, truncated };
}

async function listHubstaffPages(
  path,
  field,
  initialParams,
  { token, baseUrl = HUBSTAFF_API_BASE, maxPages = 20 } = {},
) {
  const items = [];
  let pageStartId = "";
  let truncated = false;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams(initialParams);
    params.set("page_limit", "100");
    if (pageStartId) params.set("page_start_id", pageStartId);
    const payload = await hubstaffRequest(path, params, { token, baseUrl });
    const pageItems = Array.isArray(payload?.[field]) ? payload[field] : [];
    items.push(...pageItems);

    const nextPageStartId = String(payload?.pagination?.next_page_start_id || "");
    if (!nextPageStartId || nextPageStartId === pageStartId || !pageItems.length) {
      truncated = false;
      break;
    }
    pageStartId = nextPageStartId;
    truncated = page === maxPages - 1;
  }

  return { items, truncated };
}

async function mapWithConcurrency(items, concurrency, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        try {
          results[index] = { status: "fulfilled", value: await worker(items[index], index) };
        } catch (reason) {
          results[index] = { status: "rejected", reason };
        }
      }
    },
  );
  await Promise.all(workers);
  return results;
}

async function listHubstaffCollection(path, field, token, initialParams = undefined) {
  const items = [];
  let pageStartId = "";

  for (let page = 0; page < 20; page += 1) {
    const params = new URLSearchParams(initialParams);
    params.set("page_limit", "100");
    if (pageStartId) params.set("page_start_id", pageStartId);
    const payload = await hubstaffRequest(path, params, { token });
    const pageItems = Array.isArray(payload?.[field]) ? payload[field] : [];
    items.push(...pageItems);

    const nextPageStartId = String(payload?.pagination?.next_page_start_id || "");
    if (!nextPageStartId || nextPageStartId === pageStartId || !pageItems.length) break;
    pageStartId = nextPageStartId;
  }

  return items;
}

async function loadIntegrationProjectLinks(token) {
  return cachedHubstaffResult(
    integrationProjectLinkCache,
    "all",
    async () => {
      const organizations = await listHubstaffCollection(
        "/v2/organizations",
        "organizations",
        token,
      );
      const integrationResults = await Promise.allSettled(
        organizations
          .filter((organization) => Number.isSafeInteger(Number(organization?.id)))
          .map((organization) => listHubstaffCollection(
            `/v2/organizations/${Number(organization.id)}/integrations`,
            "integrations",
            token,
          )),
      );
      const integrations = integrationResults.flatMap((result) => (
        result.status === "fulfilled" ? result.value : []
      )).filter((integration) => (
        Number.isSafeInteger(Number(integration?.id))
        && String(integration?.status || "active").toLowerCase() === "active"
        && /hubstaff[_ -]?tasks/i.test(`${integration?.type || ""} ${integration?.name || ""}`)
      ));
      if (!integrations.length) {
        throw hubstaffError(
          "hubstaff_tasks_integration_not_found",
          "No active Hubstaff Tasks integration was found in the v2 organizations.",
          404,
        );
      }
      const linkResults = await Promise.allSettled(integrations.map((integration) => (
        listHubstaffCollection(
          `/v2/integrations/${Number(integration.id)}/project_links`,
          "project_links",
          token,
        )
      )));
      const byRemoteId = new Map();
      for (const result of linkResults) {
        if (result.status !== "fulfilled") continue;
        for (const link of result.value) {
          if (
            !Number.isSafeInteger(Number(link?.project_id))
            || String(link?.status || "active").toLowerCase() !== "active"
          ) continue;
          for (const remoteId of [link?.remote_id, link?.remote_alternate_id]) {
            const key = String(remoteId || "").trim();
            if (!key) continue;
            const existing = byRemoteId.get(key) || [];
            existing.push(Number(link.project_id));
            byRemoteId.set(key, existing);
          }
        }
      }
      if (!byRemoteId.size) {
        throw hubstaffError(
          "hubstaff_project_links_unavailable",
          "Hubstaff returned no active integration project links.",
          404,
        );
      }
      return byRemoteId;
    },
    PROJECT_RESOLUTION_TTL_MS,
  );
}

async function resolveTrackingProjectFromIntegrationLinks(project, token) {
  const byRemoteId = await loadIntegrationProjectLinks(token);
  const matches = [...new Set(byRemoteId.get(String(project.projectId)) || [])];
  if (matches.length !== 1) {
    throw hubstaffError(
      matches.length ? "hubstaff_project_link_ambiguous" : "hubstaff_project_link_not_found",
      matches.length
        ? "More than one Hubstaff v2 project is linked to this Tasks project."
        : "No Hubstaff v2 project link was found for this Tasks project.",
      404,
    );
  }
  return {
    trackingProjectId: matches[0],
    projectPayload: null,
    source: "v2_integration_project_link",
  };
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

async function listProjectMembersFresh(projectId, token) {
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

async function listProjectMembers(projectId, token) {
  return cachedHubstaffResult(
    projectMemberCache,
    String(projectId),
    () => listProjectMembersFresh(projectId, token),
    PROJECT_MEMBER_CACHE_TTL_MS,
  );
}

async function loadTrackingProject(projectId, token) {
  return cachedHubstaffResult(
    trackingProjectCache,
    String(projectId),
    () => hubstaffRequest(`/v2/projects/${projectId}`, undefined, { token }),
    PROJECT_MEMBER_CACHE_TTL_MS,
  );
}

async function resolveTrackingProjectFresh(project, token) {
  try {
    return await resolveTrackingProjectFromIntegrationLinks(project, token);
  } catch {
    // Older accounts or restricted PATs may not expose integration links.
    // Preserve the existing direct-ID and name-match resolver as a fallback.
  }

  const [directResult, tasksResult, scopedProjectsResult] = await Promise.allSettled([
    hubstaffRequest(`/v2/projects/${project.projectId}`, undefined, { token }),
    hubstaffRequest(
      `/v1/projects/${project.projectId}`,
      undefined,
      { token, baseUrl: HUBSTAFF_TASKS_API_BASE },
    ),
    listTrackingProjects(project.organizationId, token),
  ]);

  if (directResult.status === "fulfilled") {
    return {
      trackingProjectId: project.projectId,
      projectPayload: directResult.value,
      source: "time_tracking_url",
    };
  }
  if (directResult.reason?.publicDetails?.httpStatus !== 404) throw directResult.reason;
  if (tasksResult.status === "rejected") throw tasksResult.reason;

  // A tasks.hubstaff.com URL contains a Hubstaff Tasks project ID, which is a
  // different namespace from the Hubstaff Time Tracking project ID needed for
  // activity and budget endpoints. Resolve the linked project by its name among
  // the time-tracking organizations this member can access.
  const tasksPayload = tasksResult.value;
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
  if (scopedProjectsResult.status === "fulfilled") {
    matches = scopedProjectsResult.value
      .map((candidate) => ({
        ...candidate,
        portalNameMatchScore: projectNameMatchScore(candidate?.name, tasksProjectName),
      }))
      .filter((candidate) => candidate.portalNameMatchScore > 0);
  } else {
    const error = scopedProjectsResult.reason;
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

async function resolveTrackingProject(project, token) {
  const key = project.url;
  const now = Date.now();
  const cached = projectResolutionCache.get(key);
  if (cached?.value && cached.expiresAt > now) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = resolveTrackingProjectFresh(project, token);
  projectResolutionCache.set(key, { promise, value: null, expiresAt: 0 });
  try {
    const value = await promise;
    projectResolutionCache.set(key, {
      promise: null,
      value,
      expiresAt: Date.now() + PROJECT_RESOLUTION_TTL_MS,
    });
    return value;
  } catch (error) {
    projectResolutionCache.delete(key);
    throw error;
  }
}

async function loadHubstaffProjectFresh(value, {
  monthlyHoursLimit = null,
  includeTasks = true,
  trackingProjectId = null,
} = {}) {
  const project = parseHubstaffProjectUrl(value);
  if (!project) return { configured: false };
  const token = await getAccessToken();
  const storedTrackingProjectId = Number(trackingProjectId);
  const resolvedProject = Number.isSafeInteger(storedTrackingProjectId) && storedTrackingProjectId > 0
    ? {
        trackingProjectId: storedTrackingProjectId,
        projectPayload: null,
        source: "portal_tracking_project_cache",
      }
    : await resolveTrackingProject(project, token);
  const resolvedTrackingProjectId = resolvedProject.trackingProjectId;

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
    resolvedProject.projectPayload
      ? Promise.resolve(resolvedProject.projectPayload)
      : loadTrackingProject(resolvedTrackingProjectId, token),
    includeTasks
      ? hubstaffRequest(`/v2/projects/${resolvedTrackingProjectId}/tasks`, taskParams, { token })
      : Promise.resolve(null),
    hubstaffRequest(`/v2/projects/${resolvedTrackingProjectId}/activities/daily`, activityParams, { token }),
    hubstaffRequest(`/v2/projects/${resolvedTrackingProjectId}/budget_histories`, new URLSearchParams({ page_limit: "100" }), { token }),
    listProjectMembers(resolvedTrackingProjectId, token),
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
    .map((task) => normalizeHubstaffTask(task, resolvedTrackingProjectId))
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
      trackingProjectId: resolvedTrackingProjectId,
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

/**
 * Reuse the dashboard's recent server-side Hubstaff result for assistant
 * questions. In-flight requests are shared too, preventing a dashboard poll
 * and a chat message from making the same upstream calls simultaneously.
 * This cache contains only server-fetched, tenant-scoped data and never trusts
 * values supplied by the browser.
 */
export async function loadHubstaffProject(value, options = {}) {
  const project = parseHubstaffProjectUrl(value);
  if (!project) return { configured: false };
  const includeTasks = options.includeTasks !== false;
  const monthlyHoursLimit = options.monthlyHoursLimit ?? null;
  const trackingProjectId = options.trackingProjectId ?? null;
  const key = JSON.stringify([project.url, monthlyHoursLimit, includeTasks, trackingProjectId]);
  const now = Date.now();
  const cached = projectCache.get(key);
  if (cached?.value && cached.expiresAt > now) return cached.value;
  if (cached?.promise) return cached.promise;

  const promise = loadHubstaffProjectFresh(project.url, {
    monthlyHoursLimit,
    includeTasks,
    trackingProjectId,
  });
  projectCache.set(key, { promise, value: null, expiresAt: 0 });

  try {
    const result = await promise;
    projectCache.set(key, {
      promise: null,
      value: result,
      expiresAt: Date.now() + PROJECT_CACHE_TTL_MS,
    });
    while (projectCache.size > PROJECT_CACHE_LIMIT) {
      projectCache.delete(projectCache.keys().next().value);
    }
    return result;
  } catch (error) {
    projectCache.delete(key);
    throw error;
  }
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

async function loadHubstaffWorkflowFresh(value) {
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

export async function loadHubstaffWorkflow(value) {
  const project = tasksProject(value);
  return cachedHubstaffResult(
    workflowCache,
    project.url,
    () => loadHubstaffWorkflowFresh(project.url),
  );
}

async function loadHubstaffWorkflowOverviewFresh(value) {
  const project = tasksProject(value);
  const range = monthDateRange(new Date(), process.env.HUBSTAFF_REPORT_TIME_ZONE);
  const taskParams = new URLSearchParams({ page_limit: "100", removed: "false" });
  taskParams.set("updated[start]", `${range.start}T00:00:00Z`);
  const exclusiveStop = new Date(`${range.stop}T00:00:00Z`);
  exclusiveStop.setUTCDate(exclusiveStop.getUTCDate() + 1);
  taskParams.set("updated[stop]", exclusiveStop.toISOString());

  // Fetch column definitions and this month's changed tasks concurrently.
  // This replaces the former waterfall: columns -> Done list -> Done tasks.
  const workflowPromise = loadHubstaffWorkflow(project.url);
  const token = await getAccessToken();
  const completedTasksPromise = listHubstaffTaskPages(
    `/v1/projects/${project.projectId}/tasks`,
    taskParams,
    token,
  );
  const [workflow, completedResult] = await Promise.all([
    workflowPromise,
    completedTasksPromise,
  ]);
  const doneColumns = workflow.columns.filter((column) => column.stage === "done");
  const doneColumnIds = new Set(doneColumns.map((column) => column.id));
  const completedTasksByList = Object.fromEntries(doneColumns.map((column) => [
    column.id,
    { tasks: [], source: null },
  ]));

  for (const task of completedResult.tasks) {
    const listId = String(task?.list_id ?? task?.list?.id ?? "");
    if (
      !doneColumnIds.has(listId)
      || task?.done !== true
      || Number(task?.list?.project_id) !== project.projectId
    ) continue;
    const doneAt = typeof task?.done_at === "string" ? task.done_at.slice(0, 10) : "";
    if (!doneAt || doneAt < range.start || doneAt > range.stop) continue;
    const normalized = normalizeHubstaffWorkflowTask(task, project);
    if (normalized) completedTasksByList[listId].tasks.push(normalized);
  }

  for (const column of doneColumns) {
    completedTasksByList[column.id].tasks.sort((first, second) => (
      String(second.doneAt || "").localeCompare(String(first.doneAt || ""))
    ));
    completedTasksByList[column.id].source = {
      fetchedAt: new Date().toISOString(),
      monthStart: range.start,
      monthEnd: range.stop,
      truncated: completedResult.truncated,
    };
  }

  return {
    ...workflow,
    completedTasksByList,
    source: {
      ...workflow.source,
      completedTasksTruncated: completedResult.truncated,
    },
  };
}

export async function loadHubstaffWorkflowOverview(value) {
  const project = tasksProject(value);
  return cachedHubstaffResult(
    workflowOverviewCache,
    project.url,
    () => loadHubstaffWorkflowOverviewFresh(project.url),
  );
}

async function loadHubstaffWorkflowTasksFresh(value, listIdValue) {
  const project = tasksProject(value);
  const listId = Number(listIdValue);
  if (!Number.isSafeInteger(listId) || listId <= 0) {
    throw hubstaffError("invalid_hubstaff_list", "Select a valid Hubstaff workflow column.", 400);
  }

  const workflow = await loadHubstaffWorkflow(project.url);
  const list = workflow.columns.find((column) => column.id === String(listId));
  if (!list) {
    throw hubstaffError(
      "hubstaff_list_forbidden",
      "That Hubstaff column does not belong to this client’s project.",
      403,
    );
  }

  const token = await getAccessToken();
  const range = monthDateRange(new Date(), process.env.HUBSTAFF_REPORT_TIME_ZONE);
  const stage = hubstaffWorkflowStage(list.name, list.type);
  const params = new URLSearchParams({ page_limit: "100", removed: "false" });
  if (stage === "done") {
    params.set("updated[start]", `${range.start}T00:00:00Z`);
    const exclusiveStop = new Date(`${range.stop}T00:00:00Z`);
    exclusiveStop.setUTCDate(exclusiveStop.getUTCDate() + 1);
    params.set("updated[stop]", exclusiveStop.toISOString());
  }
  const taskResult = await listHubstaffTaskPages(
    `/v1/lists/${listId}/tasks`,
    params,
    token,
  );
  const rawTasks = taskResult.tasks;
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
      truncated: taskResult.truncated,
    },
  };
}

export async function loadHubstaffWorkflowTasks(value, listIdValue) {
  const project = tasksProject(value);
  const listId = Number(listIdValue);
  return cachedHubstaffResult(
    workflowTaskCache,
    `${project.url}:${listId}`,
    () => loadHubstaffWorkflowTasksFresh(project.url, listId),
  );
}

function workflowColumnsForQuery(columns, query, includeDoneByDefault = false) {
  const normalize = (value) => String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const normalizedQuery = normalize(query);
  const named = columns.filter((column) => {
    const name = normalize(column.name);
    return name.length >= 3 && normalizedQuery.includes(name);
  });
  if (named.length) return named;

  const requestedStages = new Set();
  if (/\b(review|approval|feedback|qa|testing)\b/.test(normalizedQuery)) requestedStages.add("review");
  if (/\b(in progress|doing|working|wip)\b/.test(normalizedQuery)) requestedStages.add("in_progress");
  if (/\b(to do|todo|up next|backlog)\b/.test(normalizedQuery)) requestedStages.add("todo");
  if (/\b(done|completed|completion|finished|closed)\b/.test(normalizedQuery)) requestedStages.add("done");
  if (requestedStages.size) return columns.filter((column) => requestedStages.has(column.stage));
  return includeDoneByDefault ? columns : columns.filter((column) => column.stage !== "done");
}

function exclusiveRangeStop(stop) {
  const date = new Date(`${stop}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString();
}

function taskDateInRange(task, range, completedOnly) {
  if (range?.allHistory) return true;
  const candidates = completedOnly
    ? [task?.done_at]
    : [task?.done_at, task?.updated_at, task?.created_at];
  return candidates.some((value) => {
    const date = typeof value === "string" ? value.slice(0, 10) : "";
    return date && date >= range.start && date <= range.stop;
  });
}

function assistantNormalizedWorkflowTask(normalized, column) {
  if (!normalized) return null;
  return {
    id: normalized.id,
    title: normalized.title,
    details: normalized.description,
    href: normalized.href,
    status: normalized.done ? "completed" : "active",
    column: column.name,
    stage: column.stage,
    completedAt: normalized.doneAt,
    createdAt: normalized.createdAt,
    updatedAt: normalized.updatedAt,
    dueAt: normalized.dueAt,
    assigneeIds: normalized.assigneeIds,
    followerIds: normalized.followerIds,
  };
}

function assistantWorkflowTask(task, column, project) {
  return assistantNormalizedWorkflowTask(normalizeHubstaffWorkflowTask(task, project), column);
}

async function loadHubstaffAssistantWorkflow(value, query) {
  const project = tasksProject(value);
  const [token, workflow] = await Promise.all([
    getAccessToken(),
    loadHubstaffWorkflow(project.url),
  ]);
  const columns = workflow.columns;
  const requestedRange = hubstaffTaskDateRange(
    query,
    new Date(),
    process.env.HUBSTAFF_REPORT_TIME_ZONE || "UTC",
  );
  const selectedColumns = workflowColumnsForQuery(columns, query, Boolean(requestedRange));
  const completedOnly = /\b(done|completed|completion|finished|closed|resolved)\b/i.test(String(query || ""));

  if (requestedRange) {
    const params = new URLSearchParams({ page_limit: "100", removed: "false" });
    // "All history" intentionally sends no invented start date. Hubstaff
    // decides how far back this project actually exists and what it retains.
    if (!requestedRange.allHistory) {
      params.set("updated[start]", `${requestedRange.start}T00:00:00Z`);
      params.set("updated[stop]", exclusiveRangeStop(requestedRange.stop));
    }
    const taskResult = await listHubstaffTaskPages(
      `/v1/projects/${project.projectId}/tasks`,
      params,
      token,
    );
    const selectedColumnIds = new Set(selectedColumns.map((column) => column.id));
    const columnsById = new Map(columns.map((column) => [column.id, column]));
    const tasks = taskResult.tasks
      .filter((task) => {
        const listId = String(task?.list_id ?? task?.list?.id ?? "");
        return selectedColumnIds.has(listId)
          && taskDateInRange(task, requestedRange, completedOnly);
      })
      .map((task) => {
        const listId = String(task?.list_id ?? task?.list?.id ?? "");
        return assistantWorkflowTask(task, columnsById.get(listId), project);
      })
      .filter(Boolean);
    return {
      columns,
      loadedColumnIds: selectedColumns.map((column) => column.id),
      tasks,
      partial: false,
      truncated: Boolean(workflow.source?.truncated) || taskResult.truncated,
      dateRange: {
        ...requestedRange,
        field: completedOnly ? "completed_at" : "task_activity",
      },
    };
  }

  const results = await Promise.allSettled(selectedColumns.map(async (column) => {
    // Reuse the same short-lived, tenant-scoped cache as the dashboard's
    // expanded column. This avoids a duplicate Hubstaff request and ensures
    // the assistant sees the same task cards that are already visible.
    const taskResult = await loadHubstaffWorkflowTasks(project.url, column.id);
    const tasks = taskResult.tasks
      .map((task) => assistantNormalizedWorkflowTask(task, column))
      .filter(Boolean);
    return {
      tasks,
      truncated: Boolean(taskResult.source?.truncated),
    };
  }));
  return {
    columns,
    loadedColumnIds: selectedColumns.map((column) => column.id),
    tasks: results.flatMap((result) => result.status === "fulfilled" ? result.value.tasks : []),
    partial: results.some((result) => result.status === "rejected"),
    truncated: Boolean(workflow.source?.truncated)
      || results.some((result) => result.status === "fulfilled" && result.value.truncated),
    dateRange: null,
  };
}

function isoUtcDate(date) {
  return date.toISOString().slice(0, 10);
}

function activityAvailabilityRange(now = new Date(), timeZone = "UTC") {
  const today = monthDateRange(now, timeZone).stop;
  const earliest = new Date(`${today}T00:00:00Z`);
  earliest.setUTCFullYear(earliest.getUTCFullYear() - 3);
  return { earliest: isoUtcDate(earliest), today };
}

function splitDateRange(start, stop, daysPerChunk = 31) {
  const chunks = [];
  let cursor = new Date(`${start}T00:00:00Z`);
  const finalDate = new Date(`${stop}T00:00:00Z`);
  while (cursor <= finalDate) {
    const chunkStop = new Date(cursor);
    chunkStop.setUTCDate(chunkStop.getUTCDate() + daysPerChunk - 1);
    if (chunkStop > finalDate) chunkStop.setTime(finalDate.getTime());
    chunks.push({ start: isoUtcDate(cursor), stop: isoUtcDate(chunkStop) });
    cursor = new Date(chunkStop);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return chunks;
}

function hoursValue(seconds) {
  return Math.round((numeric(seconds) / 3600) * 100) / 100;
}

function rankedEntries(entries, limit, direction = "desc") {
  return [...entries]
    .filter(([, seconds]) => numeric(seconds) > 0)
    .sort((first, second) => direction === "asc"
      ? numeric(first[1]) - numeric(second[1])
      : numeric(second[1]) - numeric(first[1]))
    .slice(0, limit);
}

async function loadHubstaffActivityAnalytics(value, query, options = {}) {
  const project = tasksProject(value);
  const timeZone = process.env.HUBSTAFF_REPORT_TIME_ZONE || "UTC";
  const requestedRange = hubstaffTaskDateRange(query, new Date(), timeZone)
    || {
      ...monthDateRange(new Date(), timeZone),
      label: "this month",
      kind: "month",
    };
  const availableRange = activityAvailabilityRange(new Date(), timeZone);
  const requestedStart = requestedRange.start;
  const requestedStop = requestedRange.stop || availableRange.today;
  const apiEffectiveStart = requestedStart
    ? (requestedStart < availableRange.earliest ? availableRange.earliest : requestedStart)
    : availableRange.earliest;
  const effectiveStop = requestedStop > availableRange.today ? availableRange.today : requestedStop;
  const retentionLimited = requestedStart === null || requestedStart < availableRange.earliest;

  if (effectiveStop < availableRange.earliest || apiEffectiveStart > availableRange.today || apiEffectiveStart > effectiveStop) {
    return {
      requested: true,
      available: false,
      requestedRange,
      availableRange,
      message: "Hubstaff daily activity history is only available for the latest three years.",
    };
  }

  const rankLimit = hubstaffRankingLimit(query);
  const key = JSON.stringify([
    project.url,
    Number(options.trackingProjectId) || null,
    apiEffectiveStart,
    effectiveStop,
    rankLimit,
  ]);
  return cachedHubstaffResult(
    assistantAnalyticsCache,
    key,
    async () => {
      const token = await getAccessToken();
      const storedTrackingProjectId = Number(options.trackingProjectId);
      const resolved = Number.isSafeInteger(storedTrackingProjectId) && storedTrackingProjectId > 0
        ? { trackingProjectId: storedTrackingProjectId }
        : await resolveTrackingProject(project, token);
      const trackingProjectId = resolved.trackingProjectId;
      const trackingProjectPayload = resolved.projectPayload
        || await loadTrackingProject(trackingProjectId, token).catch(() => ({}));
      const projectCreatedAt = typeof trackingProjectPayload?.project?.created_at === "string"
        ? trackingProjectPayload.project.created_at.slice(0, 10)
        : "";
      const effectiveStart = projectCreatedAt && projectCreatedAt > apiEffectiveStart
        ? projectCreatedAt
        : apiEffectiveStart;
      if (effectiveStart > effectiveStop) {
        return {
          requested: true,
          available: true,
          readOnly: true,
          requestedRange,
          effectiveRange: null,
          availableRange: { ...availableRange, projectCreatedAt },
          retentionLimited,
          retentionNotice: retentionLimited
            ? "Hubstaff daily activity analytics are limited to the latest three years."
            : "",
          totalHours: 0,
          activityRows: 0,
          rankings: {
            tasks: { highest: [], lowest: [] },
            days: { highest: [], lowest: [] },
            months: { highest: [], lowest: [] },
            years: { highest: [], lowest: [] },
          },
          source: { fetchedAt: new Date().toISOString(), partial: false, taskCatalogTruncated: false },
        };
      }
      const chunks = splitDateRange(effectiveStart, effectiveStop);
      const taskParams = new URLSearchParams();
      for (const status of [
        "active",
        "completed",
        "archived",
        "archived_native_active",
        "archived_native_completed",
      ]) taskParams.append("status[]", status);

      const [activityResults, taskResult] = await Promise.all([
        mapWithConcurrency(chunks, 4, (chunk) => {
          const params = new URLSearchParams({
            "date[start]": chunk.start,
            "date[stop]": chunk.stop,
          });
          return listHubstaffPages(
            `/v2/projects/${trackingProjectId}/activities/daily`,
            "daily_activities",
            params,
            { token },
          );
        }),
        listHubstaffPages(
          `/v2/projects/${trackingProjectId}/tasks`,
          "tasks",
          taskParams,
          { token },
        ).catch(() => ({ items: [], truncated: true })),
      ]);
      const fulfilledActivityResults = activityResults
        .filter((result) => result.status === "fulfilled")
        .map((result) => result.value);
      if (!fulfilledActivityResults.length) {
        throw hubstaffError(
          "hubstaff_activity_unavailable",
          "Hubstaff activity history could not be loaded for that range.",
          503,
        );
      }

      const tasksById = new Map(taskResult.items.map((task) => [Number(task?.id), task]));
      const byTask = new Map();
      const byDay = new Map();
      const byMonth = new Map();
      const byYear = new Map();
      let totalSeconds = 0;
      let activityRows = 0;
      for (const row of fulfilledActivityResults.flatMap((result) => result.items)) {
        if (row?.project_id && Number(row.project_id) !== Number(trackingProjectId)) continue;
        const seconds = numeric(row?.tracked ?? row?.total_tracked ?? row?.tracked_seconds);
        const date = String(row?.date || row?.time_slot || "").slice(0, 10);
        if (!seconds || !/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
        totalSeconds += seconds;
        activityRows += 1;
        const taskId = Number(row?.task_id);
        if (Number.isSafeInteger(taskId) && taskId > 0) {
          byTask.set(taskId, numeric(byTask.get(taskId)) + seconds);
        }
        byDay.set(date, numeric(byDay.get(date)) + seconds);
        byMonth.set(date.slice(0, 7), numeric(byMonth.get(date.slice(0, 7))) + seconds);
        byYear.set(date.slice(0, 4), numeric(byYear.get(date.slice(0, 4))) + seconds);
      }

      const taskEntry = ([taskId, seconds]) => {
        const task = tasksById.get(Number(taskId));
        const remoteId = Number(task?.remote_id || task?.remote_alternate_id);
        return {
          taskId: String(taskId),
          title: sanitizeHubstaffTaskDescription(task?.summary || `Task ${taskId}`).slice(0, 180),
          hours: hoursValue(seconds),
          href: Number.isSafeInteger(remoteId) && remoteId > 0
            ? `${project.url}/tasks/${remoteId}`
            : project.url,
        };
      };
      const periodEntry = ([period, seconds]) => ({ period, hours: hoursValue(seconds) });
      const taskEntries = [...byTask.entries()];

      return {
        requested: true,
        available: true,
        readOnly: true,
        requestedRange,
        effectiveRange: {
          start: effectiveStart,
          stop: effectiveStop,
          label: requestedRange.label,
        },
        availableRange: { ...availableRange, projectCreatedAt },
        retentionLimited,
        retentionNotice: retentionLimited
          ? "Hubstaff daily activity analytics are limited to the latest three years."
          : "",
        totalHours: hoursValue(totalSeconds),
        activityRows,
        rankings: {
          tasks: {
            highest: rankedEntries(taskEntries, rankLimit, "desc").map(taskEntry),
            lowest: rankedEntries(taskEntries, rankLimit, "asc").map(taskEntry),
          },
          days: {
            highest: rankedEntries(byDay.entries(), rankLimit, "desc").map(periodEntry),
            lowest: rankedEntries(byDay.entries(), rankLimit, "asc").map(periodEntry),
          },
          months: {
            highest: rankedEntries(byMonth.entries(), rankLimit, "desc").map(periodEntry),
            lowest: rankedEntries(byMonth.entries(), rankLimit, "asc").map(periodEntry),
          },
          years: {
            highest: rankedEntries(byYear.entries(), rankLimit, "desc").map(periodEntry),
            lowest: rankedEntries(byYear.entries(), rankLimit, "asc").map(periodEntry),
          },
        },
        source: {
          fetchedAt: new Date().toISOString(),
          partial: activityResults.some((result) => result.status === "rejected")
            || fulfilledActivityResults.some((result) => result.truncated),
          taskCatalogTruncated: taskResult.truncated,
        },
      };
    },
    ASSISTANT_ANALYTICS_CACHE_TTL_MS,
  );
}

function credentialSignal(value) {
  const text = String(value || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ");
  if (!text.trim()) return false;
  const hasEmail = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(text);
  const hasCredentialWord = /\b(?:credential(?:s)?|password(?:s)?|passcode(?:s)?|pwd|api[ _-]?key(?:s)?|access[ _-]?token(?:s)?|refresh[ _-]?token(?:s)?|secret(?:s)?)\b/i.test(text);
  const hasLoginPair = /\b(?:login|sign[ -]?in|user[ -]?name|email)\b[\s\S]{0,160}\b(?:password|passcode|pwd)\b|\b(?:password|passcode|pwd)\b[\s\S]{0,160}\b(?:login|sign[ -]?in|user[ -]?name|email)\b/i.test(text);
  return hasCredentialWord || hasLoginPair || hasEmail;
}

function safeMemberDisplayName(member) {
  const value = [member?.name, member?.screen_name]
    .find((candidate) => typeof candidate === "string" && candidate.trim());
  return value
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 100)
    : "";
}

async function loadTasksProjectMemberNames(value) {
  const project = tasksProject(value);
  return cachedHubstaffResult(
    tasksProjectMemberCache,
    project.url,
    async () => {
      const token = await getAccessToken();
      const result = await listHubstaffPages(
        `/v1/projects/${project.projectId}/members`,
        "members",
        new URLSearchParams(),
        { token, baseUrl: HUBSTAFF_TASKS_API_BASE },
      );
      return {
        names: new Map(result.items.flatMap((member) => {
          const id = Number(member?.id);
          const name = safeMemberDisplayName(member);
          return Number.isSafeInteger(id) && id > 0 && name ? [[id, name]] : [];
        })),
        truncated: result.truncated,
      };
    },
    PROJECT_MEMBER_CACHE_TTL_MS,
  );
}

async function attachTaskPeople(value, tasks) {
  if (!tasks?.length) return { tasks: tasks || [], partial: false };
  let memberResult;
  try {
    memberResult = await loadTasksProjectMemberNames(value);
  } catch {
    memberResult = { names: new Map(), truncated: true };
  }
  return {
    tasks: tasks.map((task) => {
      const { assigneeIds = [], followerIds = [], ...safeTask } = task;
      const assignees = assigneeIds
        .map((id) => memberResult.names.get(Number(id)))
        .filter(Boolean);
      const followers = followerIds
        .map((id) => memberResult.names.get(Number(id)))
        .filter(Boolean);
      return {
        ...safeTask,
        assignees,
        assigneeNamesAvailable: assignees.length === assigneeIds.length,
        followers,
        followerNamesAvailable: followers.length === followerIds.length,
        completionAttribution: task.status === "completed" || task.done === true
          ? {
              available: false,
              completedAt: task.completedAt || task.doneAt || "",
              reason: "Hubstaff Tasks exposes the completion time but not a completed-by member field.",
            }
          : null,
      };
    }),
    partial: memberResult.truncated,
  };
}

async function loadTaskComments(taskId, token, maxPages = 5) {
  return listHubstaffPages(
    `/v1/tasks/${taskId}/comments`,
    "comments",
    new URLSearchParams(),
    { token, baseUrl: HUBSTAFF_TASKS_API_BASE, maxPages },
  );
}

async function loadSafeTaskConversation(taskId, token) {
  const commentResult = await loadTaskComments(taskId, token);
  let sensitiveCommentsOmitted = 0;
  const safeComments = commentResult.items.flatMap((comment) => {
    if (credentialSignal(comment?.content)) {
      sensitiveCommentsOmitted += 1;
      return [];
    }
    const content = sanitizeHubstaffTaskDescription(comment?.content);
    if (!content) return [];
    return [{
      content,
      createdAt: typeof comment?.created_at === "string" ? comment.created_at : "",
      updatedAt: typeof comment?.updated_at === "string" ? comment.updated_at : "",
    }];
  });
  return {
    available: true,
    comments: safeComments.slice(-40),
    sensitiveCommentsOmitted,
    truncated: commentResult.truncated || safeComments.length > 40,
  };
}

async function attachSafeWorkflowConversations(value, workflow) {
  if (!workflow?.tasks?.length) return workflow;
  const project = tasksProject(value);
  const token = await getAccessToken();
  const tasks = workflow.tasks.slice(0, 20);
  const results = await mapWithConcurrency(tasks, 5, async (task) => {
    const taskId = Number(task?.id);
    if (!Number.isSafeInteger(taskId) || taskId <= 0) return task;
    return {
      ...task,
      conversation: await loadSafeTaskConversation(taskId, token),
    };
  });
  return {
    ...workflow,
    tasks: results.map((result, index) => result.status === "fulfilled"
      ? result.value
      : {
          ...tasks[index],
          conversation: { available: false, comments: [], sensitiveCommentsOmitted: 0, truncated: false },
        }),
    partial: workflow.partial || workflow.tasks.length > tasks.length
      || results.some((result) => result.status === "rejected"),
    conversationsLimited: workflow.tasks.length > tasks.length,
    projectId: project.projectId,
  };
}

async function loadHubstaffCredentialAudit(value) {
  const project = tasksProject(value);
  return cachedHubstaffResult(
    credentialAuditCache,
    project.url,
    async () => {
      const token = await getAccessToken();
      const taskResult = await listHubstaffTaskPages(
        `/v1/projects/${project.projectId}/tasks`,
        new URLSearchParams({ page_limit: "100", removed: "false" }),
        token,
      );
      const projectTasks = taskResult.tasks
        .filter((task) => {
          const owningProjectId = Number(task?.list?.project_id);
          return !Number.isSafeInteger(owningProjectId) || owningProjectId === project.projectId;
        })
        .sort((first, second) => String(second?.updated_at || "").localeCompare(String(first?.updated_at || "")));
      const tasksToScan = projectTasks.slice(0, CREDENTIAL_AUDIT_TASK_LIMIT);
      const scanResults = await mapWithConcurrency(tasksToScan, 10, async (task) => {
        const taskId = Number(task?.id);
        if (!Number.isSafeInteger(taskId) || taskId <= 0) return { match: false, commentsTruncated: false };
        if (credentialSignal(`${task?.subject || ""}\n${task?.description || ""}`)) {
          return { match: true, commentsTruncated: false };
        }
        const comments = await loadTaskComments(taskId, token);
        return {
          match: comments.items.some((comment) => credentialSignal(comment?.content)),
          commentsTruncated: comments.truncated,
        };
      });
      const matches = scanResults.flatMap((result, index) => {
        if (result.status !== "fulfilled" || !result.value.match) return [];
        return [{ href: `${project.url}/tasks/${Number(tasksToScan[index].id)}` }];
      });

      return {
        requested: true,
        available: true,
        readOnly: true,
        matches,
        scannedTasks: tasksToScan.length,
        returnedTasks: projectTasks.length,
        failedTaskScans: scanResults.filter((result) => result.status === "rejected").length,
        partial: taskResult.truncated
          || projectTasks.length > tasksToScan.length
          || scanResults.some((result) => result.status === "rejected")
          || scanResults.some((result) => result.status === "fulfilled" && result.value.commentsTruncated),
        safety: "Only verified task links are included. Raw task text, comments, emails, passwords, and tokens are never returned to the assistant.",
        source: { fetchedAt: new Date().toISOString() },
      };
    },
    CREDENTIAL_AUDIT_CACHE_TTL_MS,
  );
}

async function loadReferencedHubstaffTask(value, reference, { includeConversation = false } = {}) {
  const project = tasksProject(value);
  if (
    reference.organizationId !== project.organizationId
    || reference.projectId !== project.projectId
  ) {
    throw hubstaffError(
      "hubstaff_task_forbidden",
      "That Hubstaff task link does not belong to this client's assigned project.",
      403,
    );
  }

  const token = await getAccessToken();
  const taskPayload = await hubstaffRequest(
    `/v1/tasks/${reference.taskId}`,
    undefined,
    { token, baseUrl: HUBSTAFF_TASKS_API_BASE },
  );
  const task = taskPayload?.task;
  if (!task || Number(task.id) !== reference.taskId || !Number.isSafeInteger(Number(task.list_id))) {
    throw hubstaffError("hubstaff_task_invalid", "Hubstaff returned an incomplete task record.", 502);
  }

  // Hubstaff's direct task response contains a list ID but no project ID.
  // Verify the owning list before exposing any task details across tenants.
  const listPayload = await hubstaffRequest(
    `/v1/lists/${Number(task.list_id)}`,
    undefined,
    { token, baseUrl: HUBSTAFF_TASKS_API_BASE },
  );
  if (Number(listPayload?.list?.project_id) !== project.projectId) {
    throw hubstaffError(
      "hubstaff_task_forbidden",
      "That Hubstaff task does not belong to this client's assigned project.",
      403,
    );
  }

  const list = normalizeHubstaffWorkflowList(listPayload.list);
  const normalized = normalizeHubstaffWorkflowTask(task, project);
  if (!normalized || !list) {
    throw hubstaffError("hubstaff_task_invalid", "Hubstaff returned an incomplete task record.", 502);
  }
  let conversation = null;
  if (includeConversation) {
    try {
      conversation = await loadSafeTaskConversation(reference.taskId, token);
    } catch {
      conversation = {
        available: false,
        comments: [],
        sensitiveCommentsOmitted: 0,
        truncated: false,
      };
    }
  }
  return {
    ...normalized,
    href: reference.url,
    column: list.name,
    stage: list.stage,
    status: normalized.done ? "completed" : "active",
    conversation,
  };
}

function minimalHubstaffAssistantProject(value) {
  const project = tasksProject(value);
  const range = monthDateRange(new Date(), process.env.HUBSTAFF_REPORT_TIME_ZONE);
  return {
    configured: true,
    available: true,
    project: {
      id: project.projectId,
      organizationId: project.organizationId,
      name: `Assigned Hubstaff project ${project.projectId}`,
      url: project.url,
      status: "active",
    },
    hours: {
      used: null,
      limit: null,
      limitSource: "not_requested",
      budgetSpent: null,
      budgetRecurrence: "",
      budgetPeriodStart: range.start,
      budgetPeriodEnd: range.stop,
      remaining: null,
      over: null,
    },
    costBudget: null,
    tasks: [],
    taskSummary: null,
    source: {
      fetchedAt: new Date().toISOString(),
      monthStart: range.start,
      monthEnd: range.stop,
      timeZone: range.timeZone,
      tasksLimited: false,
      activityLimited: false,
      activityAvailable: false,
      tasksAvailable: false,
      partial: false,
      metricsRequested: false,
    },
  };
}

export async function loadHubstaffAssistantSnapshot(value, options = {}) {
  if (!parseHubstaffProjectUrl(value)) return null;
  try {
    const { query = "", ...projectOptions } = options;
    const references = hubstaffTaskReferences(query);
    const wantsCredentialAudit = hubstaffCredentialAuditRequested(query);
    const wantsAnalytics = !wantsCredentialAudit && hubstaffActivityAnalyticsRequested(query);
    const wantsConversation = hubstaffTaskConversationRequested(query);
    const wantsPeople = hubstaffTaskPeopleRequested(query);
    const wantsWorkflowTasks = !references.length
      && !wantsCredentialAudit
      && !wantsAnalytics
      && hubstaffTaskDetailsRequested(query);
    const wantsMetrics = !wantsAnalytics
      && !wantsCredentialAudit
      && (hubstaffMetricsRequested(query) || (!references.length && !wantsWorkflowTasks));
    const [
      projectResult,
      workflowResult,
      analyticsResult,
      credentialAuditResult,
      ...taskResults
    ] = await Promise.allSettled([
      wantsMetrics
        ? loadHubstaffProject(value, {
            ...projectOptions,
            // Hubstaff Tasks is the authoritative source for the board shown
            // in the portal. Do not also download the tracking-task page.
            includeTasks: false,
          })
        : Promise.resolve(minimalHubstaffAssistantProject(value)),
      wantsWorkflowTasks ? loadHubstaffAssistantWorkflow(value, query) : Promise.resolve(null),
      wantsAnalytics
        ? loadHubstaffActivityAnalytics(value, query, projectOptions)
        : Promise.resolve(null),
      wantsCredentialAudit ? loadHubstaffCredentialAudit(value) : Promise.resolve(null),
      ...references.map((reference) => loadReferencedHubstaffTask(value, reference, {
        includeConversation: wantsConversation,
      })),
    ]);
    if (projectResult.status === "rejected") throw projectResult.reason;
    let workflow = workflowResult.status === "fulfilled" ? workflowResult.value : null;
    if (workflow && wantsConversation) {
      workflow = await attachSafeWorkflowConversations(value, workflow);
    }
    if (workflow && wantsPeople) {
      const people = await attachTaskPeople(value, workflow.tasks);
      workflow = {
        ...workflow,
        tasks: people.tasks,
        partial: workflow.partial || people.partial,
      };
    }
    const taskRange = workflow?.dateRange || {
      start: projectResult.value.source.monthStart,
      stop: projectResult.value.source.monthEnd,
    };
    const projectData = workflow ? {
      ...projectResult.value,
      tasks: workflow.tasks,
      taskSummary: taskSummary(workflow.tasks, taskRange),
      source: {
        ...projectResult.value.source,
        tasksAvailable: true,
        tasksLimited: workflow.truncated,
        partial: projectResult.value.source.partial || workflow.partial,
      },
    } : projectResult.value;
    const snapshot = buildHubstaffAssistantSnapshot(projectData);
    snapshot.workflow = workflow ? {
      columns: workflow.columns.map(({ id, name, stage, taskCount }) => ({ id, name, stage, taskCount })),
      loadedColumnIds: workflow.loadedColumnIds,
      partial: workflow.partial,
      truncated: workflow.truncated,
      dateRange: workflow.dateRange,
    } : null;
    let referencedTasks = taskResults
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value);
    if (wantsPeople) {
      referencedTasks = (await attachTaskPeople(value, referencedTasks)).tasks;
    } else {
      referencedTasks = referencedTasks.map((task) => {
        const safeTask = { ...task };
        delete safeTask.assigneeIds;
        delete safeTask.followerIds;
        return safeTask;
      });
    }
    snapshot.referencedTasks = referencedTasks;
    snapshot.analytics = wantsAnalytics
      ? analyticsResult.status === "fulfilled"
        ? analyticsResult.value
        : {
            requested: true,
            available: false,
            message: analyticsResult.reason?.publicDetails?.message
              || "Hubstaff activity analytics could not be loaded for this request.",
            code: analyticsResult.reason?.publicDetails?.code || "hubstaff_activity_unavailable",
          }
      : null;
    snapshot.credentialAudit = wantsCredentialAudit
      ? credentialAuditResult.status === "fulfilled"
        ? credentialAuditResult.value
        : {
            requested: true,
            available: false,
            matches: [],
            message: credentialAuditResult.reason?.publicDetails?.message
              || "The secure Hubstaff credential scan could not be completed.",
            code: credentialAuditResult.reason?.publicDetails?.code || "hubstaff_credential_scan_unavailable",
          }
      : null;
    snapshot.source.referencedTasksRequested = references.length;
    snapshot.source.referencedTasksAvailable = snapshot.referencedTasks.length;
    snapshot.source.taskDateRange = workflow?.dateRange || null;
    return snapshot;
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
