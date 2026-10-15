import assert from 'node:assert/strict';
import test from 'node:test';

import { deriveTeamWorkStatus } from '../../lib/internal-team-work-status.js';
import { loadHubstaffTeamStatuses } from '../../lib/internal-hubstaff-team-status.js';

const NOW = new Date('2026-10-15T02:00:00Z'); // Thursday, 10:00 in Manila.
const schedule = {
  start_date: '2026-01-01', start_time: '09:00:00', duration: 28800,
  repeat_schedule: 'weekly', repeat_until: null, use_time_zone: 'user',
  weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'], excluded_dates: [],
};
const leave = {
  status: 'approved', starts_at: '2026-10-15T00:00:00+08:00',
  stops_at: '2026-10-16T00:00:00+08:00',
  time_off_request_days: [{ amount_used: 28800, starts_at: '2026-10-15T00:00:00+08:00',
    stops_at: '2026-10-16T00:00:00+08:00' }],
};

test('approved leave wins, while denied and submitted leave do not mark a member Away', () => {
  const base = { schedules: [schedule], timeZone: 'Asia/Manila', now: NOW, complete: true };
  assert.equal(deriveTeamWorkStatus({ ...base, requests: [leave] }), 'Away');
  assert.equal(deriveTeamWorkStatus({ ...base, requests: [{ ...leave, status: 'submitted' }] }), 'On Shift');
  assert.equal(deriveTeamWorkStatus({ ...base, requests: [{ ...leave, status: 'denied' }] }), 'On Shift');
  assert.equal(deriveTeamWorkStatus({ ...base, requests: [{ ...leave, status: 'unrecognized' }] }), 'Unknown');
});

test('partial-day and zero-amount leave use the approved day intervals, not the outer range', () => {
  const base = { schedules: [schedule], timeZone: 'Asia/Manila', now: NOW, complete: true };
  const afternoon = { ...leave, time_off_request_days: [{ amount_used: 7200,
    starts_at: '2026-10-15T13:00:00+08:00', stops_at: '2026-10-15T15:00:00+08:00' }] };
  assert.equal(deriveTeamWorkStatus({ ...base, requests: [afternoon] }), 'On Shift');
  assert.equal(deriveTeamWorkStatus({ ...base, now: new Date('2026-10-15T06:00:00Z'),
    requests: [afternoon] }), 'Away');
  assert.equal(deriveTeamWorkStatus({ ...base, requests: [{ ...leave,
    time_off_request_days: [{ ...leave.time_off_request_days[0], amount_used: 0 }] }] }), 'On Shift');
});

test('verified weekly schedules distinguish On Shift and Off Shift, including overnight shifts', () => {
  const base = { requests: [], schedules: [schedule], timeZone: 'Asia/Manila', complete: true };
  assert.equal(deriveTeamWorkStatus({ ...base, now: NOW }), 'On Shift');
  assert.equal(deriveTeamWorkStatus({ ...base, now: new Date('2026-10-15T12:00:00Z') }), 'Off Shift');
  assert.equal(deriveTeamWorkStatus({ ...base, now: new Date('2026-10-17T02:00:00Z') }), 'Off Shift');
  assert.equal(deriveTeamWorkStatus({ ...base, schedules: [{ ...schedule,
    excluded_dates: ['2026-10-15'] }], now: NOW }), 'Off Shift');
  assert.equal(deriveTeamWorkStatus({ ...base, schedules: [{ ...schedule,
    weekdays: ['wed'], start_time: '22:00:00', duration: 28800, repeat_until: '2026-10-14' }],
  now: new Date('2026-10-14T18:00:00Z') }), 'On Shift');
});

test('missing, incomplete, unsupported, or malformed source data stays Unknown', () => {
  const base = { requests: [], schedules: [schedule], timeZone: 'Asia/Manila', now: NOW, complete: true };
  assert.equal(deriveTeamWorkStatus({ ...base, complete: false }), 'Unknown');
  assert.equal(deriveTeamWorkStatus({ ...base, schedules: [] }), 'Unknown');
  assert.equal(deriveTeamWorkStatus({ ...base, timeZone: undefined }), 'Unknown');
  assert.equal(deriveTeamWorkStatus({ ...base, schedules: [{ ...schedule, repeat_schedule: 'bi_weekly' }] }), 'Unknown');
  assert.equal(deriveTeamWorkStatus({ ...base, requests: [{ ...leave, time_off_request_days: null }] }), 'Unknown');
  assert.equal(deriveTeamWorkStatus({ ...base, timeZone: 'America/New_York',
    now: new Date('2026-11-01T06:30:00Z') }), 'Unknown');
});

test('organization reader paginates, uses member IDs, and returns only derived statuses', async () => {
  const paths = [];
  const fetchImpl = async (url, options) => {
    paths.push(url);
    assert.equal(options.headers.Authorization, 'Bearer hsoat_fixture');
    if (url.pathname === '/v2/organizations') return Response.json({ organizations: [{ id: 7 }] });
    if (url.pathname.endsWith('/members')) return Response.json({ members: [
      { user_id: 101, membership_status: 'active' }, { user_id: 202, membership_status: 'active' },
    ], users: [
      { id: 101, status: 'active', time_zone: 'Asia/Manila' },
      { id: 202, status: 'active', time_zone: 'Asia/Manila' },
    ] });
    if (url.pathname.endsWith('/time_off_requests')) {
      assert.deepEqual(url.searchParams.getAll('user_ids[]'), ['101', '202']);
      if (!url.searchParams.has('page_start_id')) return Response.json({
        time_off_requests: [{ ...leave, user_id: 101, message: 'private reason' }],
        pagination: { next_page_start_id: 500 },
      });
      return Response.json({ time_off_requests: [] });
    }
    if (url.pathname.endsWith('/attendance_schedules')) return Response.json({ attendance_schedules: [
      { ...schedule, user_id: 101 }, { ...schedule, user_id: 202 },
    ] });
    throw new Error('Unexpected endpoint');
  };
  const result = await loadHubstaffTeamStatuses(['101', '202'], {
    token: 'hsoat_fixture', fetchImpl, now: NOW, scheduleVerified: true,
  });
  assert.deepEqual([...result.statuses], [['101', 'Away'], ['202', 'On Shift']]);
  assert.equal(result.recordsProcessed, 3);
  assert.equal(paths.some(url => url.searchParams.get('page_start_id') === '500'), true);
  assert.equal(JSON.stringify([...result.statuses]).includes('private reason'), false);
});

test('shift labels stay Unknown until schedule coverage is explicitly verified', async () => {
  const fetchImpl = async url => {
    if (url.pathname === '/v2/organizations') return Response.json({ organizations: [{ id: 7 }] });
    if (url.pathname.endsWith('/members')) return Response.json({
      members: [{ user_id: 202, membership_status: 'active' }],
      users: [{ id: 202, status: 'active', time_zone: 'Asia/Manila' }],
    });
    if (url.pathname.endsWith('/time_off_requests')) return Response.json({ time_off_requests: [] });
    if (url.pathname.endsWith('/attendance_schedules')) return Response.json({
      attendance_schedules: [{ ...schedule, user_id: 202 }],
    });
    throw new Error('Unexpected endpoint');
  };
  const result = await loadHubstaffTeamStatuses(['202'], {
    token: 'hsoat_fixture', fetchImpl, now: NOW, scheduleVerified: false,
  });
  assert.equal(result.statuses.get('202'), 'Unknown');
});

test('organization reader fails closed on rejected or incomplete provider responses', async () => {
  await assert.rejects(loadHubstaffTeamStatuses(['101'], {
    token: 'hsoat_fixture', now: NOW,
    fetchImpl: async () => new Response(null, { status: 401 }),
  }), error => error.publicDetails.code === 'invalid_token');
  await assert.rejects(loadHubstaffTeamStatuses(['101'], {
    token: 'hsoat_fixture', now: NOW,
    fetchImpl: async url => url.pathname === '/v2/organizations'
      ? Response.json({ organizations: [{ id: 7 }] })
      : Response.json({ members: [], users: [], pagination: { next_page_start_id: 'bad' } }),
  }), error => error.publicDetails.code === 'hubstaff_unavailable');
});
