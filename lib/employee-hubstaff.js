import 'server-only';
import { EmployeeError } from './employee-errors.js';
import { hubstaffWorkflowStage } from './hubstaff-data.js';

// Provider origins are protocol constants, never browser-controlled URLs.
const IDENTITY_ORIGIN = 'https://api.hubstaff.com';
const TASKS_ORIGIN = 'https://tasks.hubstaff.com';
const TOKEN_ENDPOINT = 'https://account.hubstaff.com/access_tokens';
const MAX_PAGES = 10;
const PAGE_LIMIT = 500;

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

export function createEmployeeHubstaff({ fetchImpl = fetch } = {}) {
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
    if (!identity && !['/api/v1/members/me', '/api/v1/projects', '/api/v1/tasks/my/assigned'].includes(path)) {
      throw new EmployeeError('invalid_endpoint', 'This Hubstaff operation is not available.', 400);
    }
    const url = new URL(path, identity ? IDENTITY_ORIGIN : TASKS_ORIGIN);
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
    return { id, name: safeText(payload.user.name, token, 120) };
  }

  async function pages(path, field, token, signal) {
    const items = [];
    const visited = new Set();
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await get(path, token, signal, { page_limit: String(PAGE_LIMIT),
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

  async function dashboard(rawToken, approvedUserId) {
    const token = validateEmployeeToken(rawToken);
    const signal = AbortSignal.timeout(45_000);
    const user = await identity(token, approvedUserId, signal);
    const [memberPayload, projectPage, taskPage] = await Promise.all([
      get('/api/v1/members/me', token, signal),
      pages('/api/v1/projects', 'projects', token, signal),
      pages('/api/v1/tasks/my/assigned', 'tasks', token, signal),
    ]);
    // Tasks member IDs are not Hubstaff V2 user IDs. The same verified PAT
    // authenticates both APIs, and /my/assigned is scoped to that Tasks member.
    const tasksMemberId = hubstaffId(memberPayload.member?.id);
    if (!tasksMemberId) throw new EmployeeError('hubstaff_unavailable', 'Hubstaff could not verify your Tasks account. Please try again.');
    const projects = new Map(projectPage.items.filter(p => hubstaffId(p.id)).map(p => [String(p.id), {
      id: String(p.id), name: safeText(p.name, token, 120) || 'Untitled project', archived: p.archived === true,
    }]));
    const tasks = new Map();
    for (const task of taskPage.items) {
      const id = hubstaffId(task.id);
      const project = projects.get(hubstaffId(task.list?.project_id));
      const assigned = Array.isArray(task.assignee_ids) && task.assignee_ids.some(value => hubstaffId(value) === tasksMemberId);
      if (!id || !project || !assigned || task.removed === true || task.status === 'deleted'
        || !hubstaffId(task.list_id) || hubstaffId(task.list_id) !== hubstaffId(task.list?.id)) continue;
      const status = safeText(task.list.name, token, 100) || 'Assigned';
      const stage = task.done === true ? 'done' : hubstaffWorkflowStage(status, task.list.type);
      tasks.set(id, {
        id, title: safeText(task.subject, token) || 'Untitled task', projectId: project.id, projectName: project.name,
        status, stage, done: task.done === true || stage === 'done',
        dueAt: date(task.due_at) || date(task.due_on), updatedAt: date(task.updated_at), completedAt: date(task.done_at),
      });
    }
    // Only approved fields cross the server boundary; no descriptions, members, pay rates, or raw objects.
    return { tasks: [...tasks.values()], projects: [...projects.values()],
      connection: { connected: true, name: user.name },
      truncated: projectPage.truncated || taskPage.truncated };
  }

  return { dashboard, exchange };
}
