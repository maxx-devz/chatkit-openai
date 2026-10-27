import assert from 'node:assert/strict';
import test from 'node:test';

import { buildHrView, hrViewForPanels } from '../../lib/internal-hr-data.js';

test('HR view accepts one-time schedules and reveals only normalized AOC fields', () => {
  const members = [{ id: '101', name: 'AOC Member' }];
  const source = {
    policies: [{ id: 501, name: 'Vacation' }],
    schedules: [{ userId: '101', start_date: '2026-10-15', start_time: '09:00:00',
      duration: 28800, repeat_schedule: 'none', use_time_zone: 'user' }],
    requests: [{ id: 601, userId: '101', status: 'approved', time_off_policy_id: 501,
      starts_at: '2026-10-15T09:00:00+08:00', stops_at: '2026-10-15T17:00:00+08:00',
      message: 'Private leave reason', time_off_request_days: [{ date: '2026-10-15',
        amount_used: 28800, starts_at: '2026-10-15T09:00:00+08:00',
        stops_at: '2026-10-15T17:00:00+08:00' }] }],
    balances: [{ userId: '101', time_off_policy_id: 501, amount: -3600 }],
  };
  const view = buildHrView(members, new Map([['101', 'team_member']]), source,
    '2026-10', new Date('2026-10-15T02:00:00Z'));
  assert.equal(view.summary.members, 1);
  assert.equal(view.summary.approvedRequests, 1);
  assert.equal(view.summary.scheduleCoverage, 1);
  assert.equal(view.people[0].schedules[0].repeatSchedule, 'none');
  assert.deepEqual(view.people[0].schedules[0].weekdays, []);
  assert.equal(view.leaveRequests[0].reason, 'Private leave reason');
  assert.equal(view.balances[0].amountSeconds, -3600);
  assert.doesNotMatch(JSON.stringify(view), /\b101\b|601|501/);
});

test('HR panel projection excludes disabled sections and pending leave from the calendar', () => {
  const view = { month: '2026-10', generatedAt: '2026-10-15T00:00:00Z', scheduleVerified: false,
    summary: { members: 1 }, people: [{ id: 'hr-member-1', name: 'Alex', schedules: [{ startTime: '09:00' }] }],
    leaveRequests: [
      { id: 'approved', personId: 'hr-member-1', status: 'approved', reason: 'Private', days: [{ date: '2026-10-15' }] },
      { id: 'pending', personId: 'hr-member-1', status: 'submitted', reason: 'Private', days: [{ date: '2026-10-20' }] },
    ], balances: [{ personId: 'hr-member-1', policy: 'Annual leave', amountSeconds: 36000 }] };
  const projected = hrViewForPanels(view, ['hr_leave_calendar']);
  assert.equal(projected.summary, null);
  assert.deepEqual(projected.people, [{ id: 'hr-member-1', name: 'Alex' }]);
  assert.deepEqual(projected.calendarRequests, [{ id: 'approved', personId: 'hr-member-1',
    days: [{ date: '2026-10-15' }] }]);
  assert.deepEqual(projected.leaveRequests, []);
  assert.deepEqual(projected.balances, []);
  assert.doesNotMatch(JSON.stringify(projected), /Private|09:00|pending/);
});
