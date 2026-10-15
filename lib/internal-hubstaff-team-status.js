import 'server-only';
import { createHash } from 'node:crypto';
import { deriveTeamWorkStatus, TEAM_WORK_STATUS } from './internal-team-work-status.js';

const HUBSTAFF_API_ORIGIN = 'https://api.hubstaff.com';
const PAGE_LIMIT = 100;
const MAX_PAGES = 10;
const MAX_MEMBER_IDS = 200;
const REQUEST_DEADLINE_MS = 35_000;
const CACHE_MS = 60_000;

let snapshotCache = { key: '', expiresAt: 0, value: null, promise: null };

function sourceError(code = 'hubstaff_unavailable') {
  return Object.assign(new Error('Hubstaff Team status could not be verified.'), {
    publicDetails: { code, message: 'Team work status is temporarily unknown.', status: 503 },
  });
}

function hubstaffId(value) {
  const id = String(value ?? '');
  return /^[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id)) ? id : '';
}

function utcDateOffset(now, days) {
  const date = new Date(now);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function minimalRequest(request) {
  return {
    userId: hubstaffId(request?.user_id),
    status: request?.status,
    starts_at: request?.starts_at,
    stops_at: request?.stops_at,
    time_off_request_days: Array.isArray(request?.time_off_request_days)
      ? request.time_off_request_days.map(day => ({
        amount_used: day?.amount_used, starts_at: day?.starts_at, stops_at: day?.stops_at,
      })) : null,
  };
}

function minimalSchedule(schedule) {
  return {
    userId: hubstaffId(schedule?.user_id),
    start_date: schedule?.start_date,
    start_time: schedule?.start_time,
    duration: schedule?.duration,
    repeat_schedule: schedule?.repeat_schedule,
    repeat_until: schedule?.repeat_until,
    use_time_zone: schedule?.use_time_zone,
    weekdays: schedule?.weekdays,
    excluded_dates: schedule?.excluded_dates,
  };
}

async function readSnapshot(memberIds, { token, fetchImpl, now }) {
  const deadline = Date.now() + REQUEST_DEADLINE_MS;
  async function get(path, params = {}) {
    const url = new URL(path, HUBSTAFF_API_ORIGIN);
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) value.forEach(item => url.searchParams.append(`${key}[]`, item));
      else url.searchParams.set(key, value);
    }
    const remaining = Math.min(8_000, deadline - Date.now());
    if (remaining <= 0) throw sourceError();
    let response;
    try {
      response = await fetchImpl(url, {
        method: 'GET', headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(remaining),
      });
    } catch { throw sourceError(); }
    if (!response.ok) {
      await response.body?.cancel();
      throw sourceError(response.status === 429 ? 'hubstaff_rate_limit'
        : response.status === 401 ? 'invalid_token'
          : response.status === 403 ? 'hubstaff_forbidden' : 'hubstaff_unavailable');
    }
    try {
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
      return payload;
    } catch { throw sourceError(); }
  }

  async function pages(path, collection, params, visit) {
    const seen = new Set();
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await get(path, { ...params, page_limit: String(PAGE_LIMIT),
        ...(cursor ? { page_start_id: cursor } : {}) });
      const items = payload[collection];
      if (!Array.isArray(items) || items.length > PAGE_LIMIT) throw sourceError();
      visit(items, payload);
      const next = payload.pagination?.next_page_start_id;
      if (next === undefined || next === null || next === '') return;
      cursor = hubstaffId(next);
      if (!cursor || seen.has(cursor) || !items.length) throw sourceError();
      seen.add(cursor);
    }
    throw sourceError();
  }

  const organizationPayload = await get('/v2/organizations', { page_limit: String(PAGE_LIMIT) });
  const organizations = organizationPayload.organizations;
  const organizationId = Array.isArray(organizations) && organizations.length === 1
    && !organizationPayload.pagination?.next_page_start_id ? hubstaffId(organizations[0]?.id) : '';
  if (!organizationId) throw sourceError();

  const wanted = new Set(memberIds);
  const timeZones = new Map();
  const requests = [];
  const schedules = [];
  await pages(`/v2/organizations/${organizationId}/members`, 'members', { include: 'users' },
    (members, payload) => {
      if (!Array.isArray(payload.users)) throw sourceError();
      const users = new Map(payload.users.map(user => [hubstaffId(user?.id), user]));
      for (const member of members) {
        const id = hubstaffId(member?.user_id);
        if (!wanted.has(id)) continue;
        const user = users.get(id);
        if (member.membership_status === 'active' && user?.status === 'active'
          && typeof user.time_zone === 'string') timeZones.set(id, user.time_zone);
      }
    });

  for (let index = 0; index < memberIds.length; index += 50) {
    await pages(`/v2/organizations/${organizationId}/time_off_requests`, 'time_off_requests', {
      user_ids: memberIds.slice(index, index + 50),
      'starts_at[stop]': new Date(now.valueOf() + 48 * 60 * 60 * 1000).toISOString(),
    }, items => {
      for (const request of items) {
        const minimal = minimalRequest(request);
        if (!minimal.userId || !wanted.has(minimal.userId)) throw sourceError();
        requests.push(minimal);
      }
    });
  }

  await pages(`/v2/organizations/${organizationId}/attendance_schedules`, 'attendance_schedules', {
    'date[start]': utcDateOffset(now, -2), 'date[stop]': utcDateOffset(now, 2),
  }, items => {
    for (const schedule of items) {
      const minimal = minimalSchedule(schedule);
      if (!minimal.userId) throw sourceError();
      if (wanted.has(minimal.userId)) schedules.push(minimal);
    }
  });

  return { timeZones, requests, schedules, recordsProcessed: requests.length + schedules.length };
}

export function isHubstaffTeamStatusConfigured(token = process.env.HUBSTAFF_ACCESS_TOKEN) {
  return typeof token === 'string' && token.trim().startsWith('hsoat_');
}

export async function loadHubstaffTeamStatuses(memberIds, { token = process.env.HUBSTAFF_ACCESS_TOKEN,
  fetchImpl = fetch, now = new Date(),
  scheduleVerified = process.env.HUBSTAFF_TEAM_SCHEDULES_VERIFIED === 'true' } = {}) {
  const ids = [...new Set(memberIds.map(hubstaffId))].sort((a, b) => Number(a) - Number(b));
  if (!isHubstaffTeamStatusConfigured(token) || ids.some(id => !id)
    || ids.length > MAX_MEMBER_IDS || !Number.isFinite(now.valueOf())) throw sourceError();
  if (!ids.length) return { statuses: new Map(), recordsProcessed: 0 };
  const cleanToken = token.trim();
  const key = createHash('sha256').update(cleanToken).update(ids.join(',')).digest('hex');
  let snapshot;
  if (fetchImpl === fetch && snapshotCache.key === key && snapshotCache.value
    && snapshotCache.expiresAt > Date.now()) snapshot = snapshotCache.value;
  else if (fetchImpl === fetch && snapshotCache.key === key && snapshotCache.promise) {
    snapshot = await snapshotCache.promise;
  } else {
    const promise = readSnapshot(ids, { token: cleanToken, fetchImpl, now });
    if (fetchImpl === fetch) snapshotCache = { key, value: null, expiresAt: 0, promise };
    try {
      snapshot = await promise;
      if (fetchImpl === fetch && snapshotCache.promise === promise) {
        snapshotCache = { key, value: snapshot, expiresAt: Date.now() + CACHE_MS, promise: null };
      }
    } catch (error) {
      if (fetchImpl === fetch && snapshotCache.promise === promise) {
        snapshotCache = { key: '', value: null, expiresAt: 0, promise: null };
      }
      throw error;
    }
  }
  const statuses = new Map(ids.map(id => [id, deriveTeamWorkStatus({
    requests: snapshot.requests.filter(request => request.userId === id),
    schedules: scheduleVerified ? snapshot.schedules.filter(schedule => schedule.userId === id) : [],
    timeZone: snapshot.timeZones.get(id), now, complete: true,
  }) || TEAM_WORK_STATUS.UNKNOWN]));
  return { statuses, recordsProcessed: snapshot.recordsProcessed };
}
