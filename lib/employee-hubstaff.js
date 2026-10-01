import 'server-only';
import { EmployeeError } from './employee-errors.js';
import { hubstaffWorkflowStage, normalizeReportTimeZone, resolveHubstaffTaskPriority,
  sanitizeHubstaffTaskDescription } from './hubstaff-data.js';

// Provider origins are protocol constants, never browser-controlled URLs.
const IDENTITY_ORIGIN = 'https://api.hubstaff.com';
const TASKS_ORIGIN = 'https://tasks.hubstaff.com';
const TOKEN_ENDPOINT = 'https://account.hubstaff.com/access_tokens';
const MAX_PAGES = 10;
const PAGE_LIMIT = 500;
const MAX_TIME_ORGANIZATIONS = 10;

export function hubstaffId(value) {
  const text = String(value ?? '');
  return /^[1-9][0-9]*$/.test(text) && Number.isSafeInteger(Number(text)) ? text : '';
}

export function validateEmployeeToken(value) {
  const token = typeof value === 'string' ? value.trim() : '';
  if (token.length < 20 || token.length > 4096 || /[^\x21-\x7e]/.test(token) || token.startsWith('hsoat_')) {
    throw new EmployeeError('invalid_token', 'Enter the personal token issued by Hubstaff. Organization tokens are not supported.', 400);
  }
  return token;
}

function safeText(value, token, max = 240) {
  return typeof value === 'string'
    ? value.replaceAll(token, '[redacted]').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max) : '';
}

function date(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}(T.*)?$/.test(value)
    && Number.isFinite(Date.parse(value)) ? value.slice(0, 35) : '';
}

export function employeeWeekRange(now = new Date(), timeZone = 'UTC') {
  const resolvedTimeZone = normalizeReportTimeZone(timeZone);
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: resolvedTimeZone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now).map(({ type, value }) => [type, value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const todayDate = new Date(`${today}T12:00:00Z`);
  const mondayOffset = (todayDate.getUTCDay() + 6) % 7;
  todayDate.setUTCDate(todayDate.getUTCDate() - mondayOffset);
  return { weekStart: todayDate.toISOString().slice(0, 10), today, timeZone: resolvedTimeZone };
}

function addCalendarDays(value, days) {
  const dateValue = new Date(`${value}T12:00:00Z`);
  dateValue.setUTCDate(dateValue.getUTCDate() + days);
  return dateValue.toISOString().slice(0, 10);
}

function zonedDateBoundary(value, timeZone) {
  const [year, month, day] = value.split('-').map(Number);
  const target = Date.UTC(year, month - 1, day);
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  });
  let timestamp = target;
  for (let attempt = 0; attempt < 4; attempt++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(timestamp))
      .map(({ type, value: part }) => [type, part]));
    const represented = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day),
      Number(parts.hour), Number(parts.minute), Number(parts.second));
    const difference = represented - target;
    if (!difference) return new Date(timestamp).toISOString();
    timestamp -= difference;
  }
  throw new EmployeeError('hubstaff_unavailable', 'The configured reporting timezone could not be resolved.');
}

function hours(seconds) {
  return Math.round((seconds / 3600) * 100) / 100;
}

function activityRate(overallSeconds, inputTrackedSeconds) {
  return inputTrackedSeconds > 0 ? Math.round((overallSeconds / inputTrackedSeconds) * 100) : null;
}

function employeeTimeZone(value) {
  const candidate = typeof value === 'string' ? value.trim() : '';
  if (candidate) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: candidate }).format(new Date());
      return candidate;
    } catch { /* Use the configured fallback below. */ }
  }
  return normalizeReportTimeZone(process.env.HUBSTAFF_REPORT_TIME_ZONE || 'UTC');
}

export function createEmployeeHubstaff({ fetchImpl = fetch, now = () => new Date() } = {}) {
  async function exchange(refreshToken) {
    let response;
    try {
      response = await fetchImpl(TOKEN_ENDPOINT, {
        method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000),
      });
    } catch {
      throw new EmployeeError('hubstaff_unavailable', 'Hubstaff token service could not be reached. Please try again shortly.');
    }
    // Provider responses may contain credentials; never forward their bodies or messages.
    if (!response.ok) {
      const errorCode = await response.json().then(payload => payload?.error).catch(() => '');
      if (response.status === 429 || errorCode === 'rate_limit') throw new EmployeeError('hubstaff_rate_limit', 'Hubstaff is limiting token exchanges. Please wait before retrying.', 429);
      if (response.status === 400 || response.status === 401) {
        throw new EmployeeError('invalid_token', 'Hubstaff could not exchange this personal token. Check its read scopes or create a new token.', 400);
      }
      throw new EmployeeError('hubstaff_unavailable', 'Hubstaff token service could not complete the connection. Please try again shortly.');
    }
    let payload;
    try { payload = await response.json(); }
    catch { throw new EmployeeError('hubstaff_unavailable', 'Hubstaff returned an incomplete token response.'); }
    let accessToken;
    let nextRefreshToken;
    try {
      accessToken = validateEmployeeToken(payload?.access_token);
      nextRefreshToken = validateEmployeeToken(payload?.refresh_token);
    } catch {
      throw new EmployeeError('hubstaff_unavailable', 'Hubstaff returned an incomplete token response.');
    }
    const expiresIn = Number(payload?.expires_in);
    if (!Number.isFinite(expiresIn) || expiresIn <= 0 || expiresIn > 604800) {
      throw new EmployeeError('hubstaff_unavailable', 'Hubstaff returned an invalid token lifetime.');
    }
    return { accessToken, refreshToken: nextRefreshToken, expiresAt: new Date(Date.now() + expiresIn * 1000) };
  }

  async function get(path, token, signal, params = {}) {
    // No arbitrary URL, method, request body, or redirects in this adapter.
    const identity = path === '/v2/users/me';
    const organizations = path === '/v2/organizations';
    const activities = /^\/v2\/organizations\/[1-9][0-9]*\/activities$/.test(path);
    const projectLabels = /^\/api\/v1\/projects\/[1-9][0-9]*\/labels$/.test(path);
    if (!identity && !organizations && !activities && !projectLabels
      && !['/api/v1/members/me', '/api/v1/projects', '/api/v1/tasks/my/assigned'].includes(path)) {
      throw new EmployeeError('invalid_endpoint', 'This Hubstaff operation is not available.', 400);
    }
    const url = new URL(path, identity || organizations || activities ? IDENTITY_ORIGIN : TASKS_ORIGIN);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store', redirect: 'error', signal,
      });
    } catch {
      throw new EmployeeError('hubstaff_unavailable', 'Hubstaff could not be reached. Please try again shortly.');
    }
    if (!response.ok) {
      // Never propagate upstream bodies, URLs, headers, or exception messages.
      await response.body?.cancel();
      if (response.status === 401) throw new EmployeeError('invalid_token', 'Your Hubstaff access token is invalid or expired. Please reconnect.', 400);
      if (response.status === 403) throw new EmployeeError('hubstaff_forbidden', 'Hubstaff access is unavailable. Check your read permissions and plan with an administrator.', 403);
      if (response.status === 429) throw new EmployeeError('hubstaff_rate_limit', 'Hubstaff is busy. Wait a moment before refreshing.', 429);
      throw new EmployeeError('hubstaff_unavailable', 'Hubstaff could not load your work. Please try again shortly.');
    }
    try {
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
      return payload;
    } catch {
      throw new EmployeeError('hubstaff_unavailable', 'Hubstaff returned an unexpected response. Please try again.');
    }
  }

  async function identity(token, approvedUserId, signal) {
    const payload = await get('/v2/users/me', token, signal);
    const id = hubstaffId(payload.user?.id);
    if (!id || id !== hubstaffId(approvedUserId)) {
      throw new EmployeeError('identity_mismatch', 'This token does not match your approved Hubstaff account. Contact an administrator.', 403);
    }
    return { id, name: safeText(payload.user.name, token, 120),
      timeZone: employeeTimeZone(payload.user.time_zone) };
  }

  async function pages(path, field, token, signal, params = {}) {
    const items = [];
    const visited = new Set();
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await get(path, token, signal, { ...params, page_limit: String(PAGE_LIMIT),
        ...(field === 'tasks' ? { removed: 'false' } : {}),
        ...(cursor ? { page_start_id: cursor } : {}),
      });
      if (!Array.isArray(payload[field]) || payload[field].length > PAGE_LIMIT) {
        throw new EmployeeError('hubstaff_unavailable', 'Hubstaff returned an unexpected collection. Please try again.');
      }
      items.push(...payload[field]);
      const next = payload.pagination?.next_page_start_id;
      if (next === undefined || next === null || next === '') return { items, truncated: false };
      cursor = hubstaffId(next);
      if (!cursor || visited.has(cursor) || !payload[field].length) {
        throw new EmployeeError('hubstaff_unavailable', 'Hubstaff pagination could not be verified. Please try again.');
      }
      visited.add(cursor);
    }
    return { items, truncated: true };
  }

  async function weeklyActivity(token, userId, timeZone, signal) {
    const range = employeeWeekRange(now(), timeZone);
    const weekStartAt = zonedDateBoundary(range.weekStart, range.timeZone);
    const todayStartAt = zonedDateBoundary(range.today, range.timeZone);
    const tomorrowAt = zonedDateBoundary(addCalendarDays(range.today, 1), range.timeZone);
    let organizationPayload;
    try { organizationPayload = await get('/v2/organizations', token, signal, { page_limit: '100' }); }
    catch { return { ...range, available: false, partial: false, todayHours: null, weekHours: null,
      todayActivityRate: null, weekActivityRate: null }; }
    if (!Array.isArray(organizationPayload.organizations) || organizationPayload.organizations.length > 100) {
      return { ...range, available: false, partial: false, todayHours: null, weekHours: null,
        todayActivityRate: null, weekActivityRate: null };
    }
    const organizationIds = [...new Set(organizationPayload.organizations.map(item => hubstaffId(item?.id)).filter(Boolean))]
      .slice(0, MAX_TIME_ORGANIZATIONS);
    if (!organizationIds.length) {
      return { ...range, available: true, partial: false, todayHours: 0, weekHours: 0,
        todayActivityRate: null, weekActivityRate: null };
    }
    const results = await Promise.allSettled(organizationIds.map(organizationId => pages(
      `/v2/organizations/${organizationId}/activities`, 'activities', token, signal,
      { 'time_slot[start]': weekStartAt, 'time_slot[stop]': tomorrowAt,
        'user_ids[]': userId, time_zone: range.timeZone },
    )));
    const fulfilled = results.filter(result => result.status === 'fulfilled').map(result => result.value);
    if (!fulfilled.length) {
      return { ...range, available: false, partial: false, todayHours: null, weekHours: null,
        todayActivityRate: null, weekActivityRate: null };
    }
    let todaySeconds = 0;
    let weekSeconds = 0;
    let todayOverall = 0;
    let todayInputTracked = 0;
    let weekOverall = 0;
    let weekInputTracked = 0;
    for (const row of fulfilled.flatMap(result => result.items)) {
      const rowTime = Date.parse(row?.time_slot || row?.starts_at);
      const tracked = Number(row?.tracked ?? row?.total_tracked ?? row?.tracked_seconds);
      if (hubstaffId(row?.user_id) !== userId || !Number.isFinite(rowTime)
        || rowTime < Date.parse(weekStartAt) || rowTime >= Date.parse(tomorrowAt)
        || !Number.isFinite(tracked) || tracked < 0 || tracked > 172800) continue;
      const isToday = rowTime >= Date.parse(todayStartAt);
      weekSeconds += tracked;
      if (isToday) todaySeconds += tracked;
      const overall = Number(row?.overall);
      const inputTracked = Number(row?.input_tracked);
      if (!Number.isFinite(overall) || !Number.isFinite(inputTracked) || overall < 0 || inputTracked <= 0
        || overall > inputTracked || inputTracked > tracked) continue;
      weekOverall += overall;
      weekInputTracked += inputTracked;
      if (isToday) {
        todayOverall += overall;
        todayInputTracked += inputTracked;
      }
    }
    return {
      ...range,
      available: true,
      partial: Boolean(organizationPayload.pagination?.next_page_start_id)
        || organizationPayload.organizations.length > MAX_TIME_ORGANIZATIONS
        || results.some(result => result.status === 'rejected')
        || fulfilled.some(result => result.truncated),
      todayHours: hours(todaySeconds),
      weekHours: hours(weekSeconds),
      todayActivityRate: activityRate(todayOverall, todayInputTracked),
      weekActivityRate: activityRate(weekOverall, weekInputTracked),
    };
  }

  async function dashboard(rawToken, approvedUserId) {
    const token = validateEmployeeToken(rawToken);
    const signal = AbortSignal.timeout(45_000);
    const user = await identity(token, approvedUserId, signal);
    const [memberPayload, projectPage, taskPage, time] = await Promise.all([
      get('/api/v1/members/me', token, signal),
      pages('/api/v1/projects', 'projects', token, signal),
      pages('/api/v1/tasks/my/assigned', 'tasks', token, signal),
      weeklyActivity(token, user.id, user.timeZone, signal),
    ]);
    // Tasks member IDs are not Hubstaff V2 user IDs. The same verified PAT
    // authenticates both APIs, and /my/assigned is scoped to that Tasks member.
    const tasksMemberId = hubstaffId(memberPayload.member?.id);
    if (!tasksMemberId) throw new EmployeeError('hubstaff_unavailable', 'Hubstaff could not verify your Tasks account. Please try again.');
    const projects = new Map(projectPage.items.filter(p => hubstaffId(p.id)).map(p => [String(p.id), {
      id: String(p.id), name: safeText(p.name, token, 120) || 'Untitled project', archived: p.archived === true,
      organizationId: hubstaffId(p.organization_id),
    }]));
    const eligibleTasks = [];
    const labeledProjectIds = new Set();
    for (const task of taskPage.items) {
      const id = hubstaffId(task.id);
      const project = projects.get(hubstaffId(task.list?.project_id));
      const assigned = Array.isArray(task.assignee_ids) && task.assignee_ids.some(value => hubstaffId(value) === tasksMemberId);
      if (!id || !project || !assigned || task.removed === true || task.status === 'deleted'
        || !hubstaffId(task.list_id) || hubstaffId(task.list_id) !== hubstaffId(task.list?.id)) continue;
      eligibleTasks.push({ id, project, task });
      if (Array.isArray(task.label_ids) && task.label_ids.some(hubstaffId)) labeledProjectIds.add(project.id);
    }
    const labelPages = await Promise.all([...labeledProjectIds].map(async projectId => ({
      projectId,
      page: await pages(`/api/v1/projects/${projectId}/labels`, 'labels', token, signal),
    })));
    const labelsByProject = new Map(labelPages.map(({ projectId, page }) => [projectId, page.items]));
    const tasks = new Map();
    for (const { id, project, task } of eligibleTasks) {
      const status = safeText(task.list.name, token, 100) || 'Assigned';
      const stage = task.done === true ? 'done' : hubstaffWorkflowStage(status, task.list.type);
      const priority = resolveHubstaffTaskPriority(task, labelsByProject.get(project.id), project.id);
      const description = sanitizeHubstaffTaskDescription(safeText(task.description, token, 2000));
      const href = project.organizationId
        ? `https://tasks.hubstaff.com/app/organizations/${project.organizationId}/projects/${project.id}/tasks/${id}` : '';
      tasks.set(id, {
        id, title: safeText(task.subject, token) || 'Untitled task', projectId: project.id, projectName: project.name,
        status, stage, done: task.done === true || stage === 'done',
        dueAt: date(task.due_at) || date(task.due_on), createdAt: date(task.created_at),
        updatedAt: date(task.updated_at), completedAt: date(task.done_at),
        description, href,
        ...(priority ? { priority } : {}),
      });
    }
    const taskValues = [...tasks.values()];
    // Only approved, sanitized fields cross the server boundary; no members, pay rates, or raw objects.
    return { tasks: taskValues, projects: [...projects.values()].map(({ organizationId, ...project }) => project),
      connection: { connected: true, name: user.name },
      workSummary: {
        timeAvailable: time.available, timePartial: time.partial, timeZone: time.timeZone,
        today: { date: time.today, trackedHours: time.todayHours, activityRate: time.todayActivityRate },
        week: { start: time.weekStart, stop: time.today, trackedHours: time.weekHours,
          activityRate: time.weekActivityRate },
      },
      truncated: projectPage.truncated || taskPage.truncated || labelPages.some(({ page }) => page.truncated) };
  }

  return { dashboard, exchange };
}
