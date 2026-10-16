import 'server-only';
import { InternalUserError } from './internal-user-errors.js';

const ORIGIN = 'https://api.hubstaff.com';
const PAGE_LIMIT = 100;
const MAX_PAGES = 20;
const DEADLINE_MS = 40_000;

function sourceError(code = 'hubstaff_unavailable') {
  return new InternalUserError(code, 'HR data could not be verified from Hubstaff. Please try again.');
}

function hubstaffId(value) {
  const id = String(value ?? '');
  return /^[1-9][0-9]*$/.test(id) && Number.isSafeInteger(Number(id)) ? id : '';
}

export function hrMonthBounds(month) {
  const match = /^(20\d{2})-(0[1-9]|1[0-2])$/.exec(month);
  if (!match) throw new InternalUserError('invalid_month', 'Choose a valid HR calendar month.', 400);
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1));
  const stop = new Date(Date.UTC(year, monthIndex + 1, 1));
  return { month, year, start: start.toISOString(), stop: stop.toISOString(),
    lastDay: new Date(Date.UTC(year, monthIndex + 1, 0)).toISOString().slice(0, 10) };
}

export async function readHubstaffHrSource(memberIds, month, { token = process.env.HUBSTAFF_ACCESS_TOKEN,
  fetchImpl = fetch } = {}) {
  const bounds = hrMonthBounds(month);
  const ids = [...new Set(memberIds.map(hubstaffId))];
  if (typeof token !== 'string' || !token.trim().startsWith('hsoat_')
    || ids.some(id => !id) || ids.length > 200) throw sourceError('hubstaff_unavailable');
  if (!ids.length) return { requests: [], balances: [], policies: [], schedules: [], recordsProcessed: 0 };
  const wanted = new Set(ids);
  const deadline = Date.now() + DEADLINE_MS;

  async function get(path, params = {}) {
    const url = new URL(path, ORIGIN);
    for (const [key, value] of Object.entries(params)) {
      if (Array.isArray(value)) value.forEach(item => url.searchParams.append(`${key}[]`, item));
      else url.searchParams.set(key, value);
    }
    const remaining = Math.min(8_000, deadline - Date.now());
    if (remaining <= 0) throw sourceError();
    let response;
    try {
      response = await fetchImpl(url, { method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token.trim()}` },
        cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(remaining) });
    } catch { throw sourceError(); }
    if (!response.ok) {
      await response.body?.cancel();
      throw sourceError(response.status === 401 ? 'invalid_token'
        : response.status === 403 ? 'hubstaff_forbidden'
          : response.status === 429 ? 'hubstaff_rate_limit' : 'hubstaff_unavailable');
    }
    try {
      const payload = await response.json();
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error();
      return payload;
    } catch { throw sourceError(); }
  }

  async function pages(path, collection, params, select) {
    const results = [];
    const seen = new Set();
    let cursor = '';
    for (let page = 0; page < MAX_PAGES; page++) {
      const payload = await get(path, { ...params, page_limit: String(PAGE_LIMIT),
        ...(cursor ? { page_start_id: cursor } : {}) });
      const items = payload[collection];
      if (!Array.isArray(items) || items.length > PAGE_LIMIT) throw sourceError();
      for (const item of items) {
        const selected = select(item);
        if (selected) results.push(selected);
      }
      const next = payload.pagination?.next_page_start_id;
      if (next === undefined || next === null || next === '') return results;
      cursor = hubstaffId(next);
      if (!cursor || seen.has(cursor) || !items.length) throw sourceError();
      seen.add(cursor);
    }
    throw sourceError();
  }

  const organizations = await get('/v2/organizations', { page_limit: String(PAGE_LIMIT) });
  const organizationId = Array.isArray(organizations.organizations)
    && organizations.organizations.length === 1 && !organizations.pagination?.next_page_start_id
    ? hubstaffId(organizations.organizations[0]?.id) : '';
  if (!organizationId) throw sourceError();
  const path = `/v2/organizations/${organizationId}`;
  const userParams = { user_ids: ids };
  const [requests, balances, policies, schedules] = await Promise.all([
    pages(`${path}/time_off_requests`, 'time_off_requests', {
      ...userParams, 'starts_at[stop]': new Date(Date.parse(bounds.stop) + 2 * 86_400_000).toISOString(),
    }, item => {
      const id = hubstaffId(item?.user_id);
      if (!id) throw sourceError();
      return wanted.has(id) ? { ...item, userId: id } : null;
    }),
    pages(`${path}/time_off_balances`, 'time_off_balances', { ...userParams, year: String(bounds.year) }, item => {
      const id = hubstaffId(item?.user_id);
      if (!id) throw sourceError();
      return wanted.has(id) ? { ...item, userId: id } : null;
    }),
    pages(`${path}/time_off_policies`, 'time_off_policies', { status: 'all' }, item => item),
    pages(`${path}/attendance_schedules`, 'attendance_schedules', {
      'date[start]': bounds.start.slice(0, 10), 'date[stop]': bounds.lastDay,
    }, item => {
      const id = hubstaffId(item?.user_id);
      if (!id) throw sourceError();
      return wanted.has(id) ? { ...item, userId: id } : null;
    }),
  ]);
  return { requests, balances, policies, schedules,
    recordsProcessed: requests.length + balances.length + policies.length + schedules.length };
}
