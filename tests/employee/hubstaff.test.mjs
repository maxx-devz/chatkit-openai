import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeHubstaff, validateEmployeeToken } from '../../lib/employee-hubstaff.js';
import { encryptEmployeeToken, decryptEmployeeToken, employeeAccessToken, requireActiveEmployee } from '../../lib/employee-repository.js';
import { employeeErrorResponse } from '../../lib/employee-errors.js';
import { readEmployeeTokenForm, assertEmployeeRequest } from '../../lib/employee-http.js';
import { selectEmployeeTasks, dueState } from '../../lib/employee-view.js';
import { task, hubstaffFixture, testToken, employeeA, employeeB } from './fixtures.mjs';

test('GET-only adapter verifies identity and filters cross-employee, cross-project and unassigned results', async () => {
  const fixture = hubstaffFixture({ tasks: [task(), task({ id: 2, assignee_ids: [202] }), task({ id: 3, assignee_ids: [] }),
    task({ id: 4, list: { id: 10, project_id: 88 } }), task({ id: 5, list_id: 9 }), task({ id: 6, removed: true })] });
  const data = await createEmployeeHubstaff(fixture).dashboard(testToken, employeeA.hubstaff_user_id);
  assert.deepEqual(data.tasks.map(t => t.id), ['1']);
  assert.equal(data.tasks[0].stage, 'in_progress');
  assert.equal(data.connection.connected, true);
  for (const { url, options } of fixture.calls) {
    assert.equal(options.method, 'GET');
    assert.equal(options.redirect, 'error');
    assert.equal(options.cache, 'no-store');
    assert.equal(options.body, undefined);
    assert.equal(options.headers.Authorization, `Bearer ${testToken}`);
    assert.equal(url.href.includes(testToken), false);
    assert.equal(url.searchParams.has('user_id'), false);
  }
  const serialized = JSON.stringify(data);
  for (const value of [testToken, 'assignee_ids', 'private@example.invalid', 'pay_rate', 'encrypted_access_token']) assert.equal(serialized.includes(value), false);
});

test('resolves Hubstaff priority labels for assigned tasks', async () => {
  const fixture = hubstaffFixture({
    tasks: [task({ label_ids: [901, 902] })],
    labels: { 77: [
      { id: 901, name: 'Client review', project_id: 77, color: '#abcdef' },
      { id: 902, name: 'High Priority', project_id: 77, color: '#ff9900' },
    ] },
  });
  const data = await createEmployeeHubstaff(fixture).dashboard(testToken, employeeA.hubstaff_user_id);
  assert.deepEqual(data.tasks[0].priority, { name: 'High Priority', level: 'high' });
  assert.equal(fixture.calls.some(({ url }) => url.pathname === '/api/v1/projects/77/labels'), true);
});

test('new PAT is exchanged once using the fixed Hubstaff token endpoint, with rotated credentials kept server-side', async () => {
  const access = 'fixture-access-jwt-never-real-0001';
  const nextRefresh = 'fixture-rotated-pat-never-real-0002';
  const fixture = hubstaffFixture();
  const calls = [];
  const hubstaff = createEmployeeHubstaff({ fetchImpl: async (url, options) => {
    if (String(url) !== 'https://account.hubstaff.com/access_tokens') return fixture.fetchImpl(url, options);
    calls.push({ url: String(url), options });
    return Response.json({ access_token: access, refresh_token: nextRefresh, expires_in: 86400 });
  } });
  const result = await hubstaff.exchange(testToken);
  assert.equal(result.accessToken, access);
  assert.equal(result.refreshToken, nextRefresh);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.body.get('grant_type'), 'refresh_token');
  assert.equal(calls[0].options.body.get('refresh_token'), testToken);
  assert.equal(calls[0].url.includes(testToken), false);
  assert.equal((await hubstaff.dashboard(access, '101')).tasks.length, 1);
  assert.equal(fixture.calls.every(call => call.options.headers.Authorization === `Bearer ${access}`), true);
});

test('PAT exchange errors distinguish Hubstaff rate limits without leaking provider text', async () => {
  for (const [status, code] of [[400, 'invalid_token'], [429, 'hubstaff_rate_limit'], [500, 'hubstaff_unavailable']]) {
    const hubstaff = createEmployeeHubstaff({ fetchImpl: async () => Response.json({ error: testToken }, { status }) });
    await assert.rejects(hubstaff.exchange(testToken), error => {
      assert.equal(error.publicDetails.code, code);
      assert.equal(error.message.includes(testToken), false);
      return true;
    });
  }
  const limited = createEmployeeHubstaff({ fetchImpl: async () => Response.json({ error: 'rate_limit' }, { status: 400 }) });
  await assert.rejects(limited.exchange(testToken), error => error.publicDetails.code === 'hubstaff_rate_limit');
});

test('expired PAT access is renewed and rotated; a stale request reuses the saved token', async () => {
  const secret = 'fixture-employee-secret-more-than-thirty-two-chars';
  const row = { ...employeeA, encrypted_access_token: encryptEmployeeToken('fixture-expired-access-never-real', employeeA, secret),
    encrypted_refresh_token: encryptEmployeeToken(testToken, employeeA, secret),
    access_expires_at: new Date(Date.now() - 1000) };
  let exchanges = 0;
  const db = { connect: async () => ({ release() {}, query: async (sql, values) => {
    if (sql.includes('SELECT encrypted_access_token')) return { rows: [row] };
    if (sql.includes('SET encrypted_access_token')) {
      row.encrypted_access_token = values[3];
      row.encrypted_refresh_token = values[4];
      row.access_expires_at = values[5];
      return { rowCount: 1 };
    }
    return { rowCount: 1 };
  } }) };
  const exchange = async token => {
    exchanges++;
    assert.equal(token, exchanges === 1 ? testToken : 'fixture-next-refresh-never-real');
    return { accessToken: `fixture-access-rotated-${exchanges}-never-real`,
      refreshToken: 'fixture-next-refresh-never-real', expiresAt: new Date(Date.now() + 86400000) };
  };
  const first = await employeeAccessToken(db, { ...row }, secret, exchange);
  assert.equal(exchanges, 1);
  assert.equal(first, 'fixture-access-rotated-1-never-real');
  assert.equal(decryptEmployeeToken(row, secret), first);
  assert.equal(await employeeAccessToken(db, { ...row, access_expires_at: new Date(0) }, secret, exchange), first);
  assert.equal(await employeeAccessToken(db, { ...row }, secret, exchange, 'fixture-expired-access-never-real'), first);
  assert.equal(exchanges, 1);
  assert.equal(await employeeAccessToken(db, { ...row }, secret, exchange, first), 'fixture-access-rotated-2-never-real');
  assert.equal(exchanges, 2);
});

test('a token for employee B cannot retrieve any tasks for employee A; identity runs first', async () => {
  const fixture = hubstaffFixture({ userId: 202 });
  await assert.rejects(createEmployeeHubstaff(fixture).dashboard(testToken, '101'), e => e.publicDetails.code === 'identity_mismatch');
  assert.equal(fixture.calls.length, 1);
});

test('Tasks member IDs differ from V2 user IDs, and later pages contain current assignments', async () => {
  const base = hubstaffFixture({ userId: 101, memberId: 303 });
  const oldTasks = Array.from({ length: 500 }, (_, index) => task({ id: index + 1,
    assignee_ids: [303], done: true }));
  const api = createEmployeeHubstaff({ fetchImpl: async (url, options) => {
    if (url.pathname !== '/api/v1/tasks/my/assigned') return base.fetchImpl(url, options);
    assert.equal(url.searchParams.get('page_limit'), '500');
    return Response.json(url.searchParams.has('page_start_id')
      ? { tasks: [task({ id: 501, assignee_ids: [303], done: false })] }
      : { tasks: oldTasks, pagination: { next_page_start_id: 501 } });
  } });
  const result = await api.dashboard(testToken, '101');
  assert.equal(result.tasks.length, 501);
  assert.equal(result.tasks.filter(item => !item.done).length, 1);
  assert.equal(result.tasks.at(-1).id, '501');
  assert.equal(result.truncated, false);
});

test('employee B receives only B assignments, with no shared cache', async () => {
  const tasks = [task(), task({ id: 2, assignee_ids: [202] })];
  const a = await createEmployeeHubstaff(hubstaffFixture({ tasks })).dashboard(testToken, '101');
  const b = await createEmployeeHubstaff(hubstaffFixture({ tasks, userId: 202 })).dashboard(testToken, '202');
  assert.deepEqual(a.tasks.map(t => t.id), ['1']);
  assert.deepEqual(b.tasks.map(t => t.id), ['2']);
});

test('invalid, expired and denied tokens produce fixed safe errors, never upstream text', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(createEmployeeHubstaff(hubstaffFixture({ status })).dashboard(testToken, '101'), e => {
      assert.equal(e.message.includes(testToken), false);
      return true;
    });
  }
  for (const token of ['', 'short', 'hsoat_organization-token-fixture', `${testToken}\nInjected`]) assert.throws(() => validateEmployeeToken(token));
  const response = employeeErrorResponse(new Error(testToken));
  assert.equal((await response.text()).includes(testToken), false);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
});

test('only approved fields are emitted and task details redact credential-like content', async () => {
  const data = await createEmployeeHubstaff(hubstaffFixture({ tasks: [task({ subject: testToken, description: testToken, pay_rate: 100 })] })).dashboard(testToken, '101');
  assert.equal(JSON.stringify(data).includes(testToken), false);
  assert.equal(data.tasks[0].title, '[redacted]');
  assert.equal(data.tasks[0].description, '[redacted]');
  assert.equal(data.tasks[0].createdAt, '2026-09-20T12:00:00Z');
  assert.equal(data.tasks[0].href, 'https://tasks.hubstaff.com/app/organizations/9/projects/77/tasks/1');
  assert.equal(JSON.stringify(data).includes('pay_rate'), false);
});

test('weekly work summary includes only the verified employee activity and assigned tasks', async () => {
  const fixture = hubstaffFixture({
    tasks: [
      task({ id: 1, due_on: '2026-10-01' }),
      task({ id: 2, done: true, done_at: '2026-09-29T12:00:00Z' }),
    ],
    activities: [
      { id: 1, user_id: 101, time_slot: '2026-09-28T12:00:00Z', tracked: 7200, input_tracked: 6000, overall: 3000 },
      { id: 2, user_id: 101, time_slot: '2026-10-01T01:00:00Z', tracked: 1800, input_tracked: 1800, overall: 900 },
      { id: 3, user_id: 202, time_slot: '2026-10-01T01:00:00Z', tracked: 999999, input_tracked: 999999, overall: 999999 },
    ],
  });
  const data = await createEmployeeHubstaff({ ...fixture, now: () => new Date('2026-10-01T03:00:00Z') })
    .dashboard(testToken, '101');
  assert.deepEqual(data.workSummary, {
    timeAvailable: true, timePartial: false, timeZone: 'UTC',
    today: { date: '2026-10-01', trackedHours: 0.5, activityRate: 50 },
    week: { start: '2026-09-28', stop: '2026-10-01', trackedHours: 2.5, activityRate: 50 },
  });
  const activityCall = fixture.calls.find(({ url }) => url.pathname.endsWith('/activities'));
  assert.equal(activityCall.url.searchParams.get('user_ids[]'), '101');
  assert.equal(activityCall.url.searchParams.get('time_slot[start]'), '2026-09-28T00:00:00.000Z');
  assert.equal(activityCall.url.searchParams.get('time_slot[stop]'), '2026-10-02T00:00:00.000Z');
});

test('today uses configured timezone boundaries instead of the organization date label', async () => {
  const previous = process.env.HUBSTAFF_REPORT_TIME_ZONE;
  process.env.HUBSTAFF_REPORT_TIME_ZONE = 'America/New_York';
  try {
    const fixture = hubstaffFixture({ timeZone: 'Asia/Manila', activities: [
      { id: 1, user_id: 101, date: '2026-09-30', time_slot: '2026-10-01T01:00:00Z', tracked: 12600,
        input_tracked: 10800, overall: 5400 },
      { id: 2, user_id: 101, date: '2026-09-30', time_slot: '2026-09-30T15:30:00Z', tracked: 1800,
        input_tracked: 1200, overall: 300 },
    ] });
    const data = await createEmployeeHubstaff({ ...fixture, now: () => new Date('2026-10-01T03:00:00Z') })
      .dashboard(testToken, '101');
    assert.equal(data.workSummary.today.trackedHours, 3.5);
    assert.equal(data.workSummary.week.trackedHours, 4);
    assert.equal(data.workSummary.today.activityRate, 50);
    assert.equal(data.workSummary.week.activityRate, 48);
    assert.equal(data.workSummary.timeZone, 'Asia/Manila');
    const activityCall = fixture.calls.find(({ url }) => url.pathname.endsWith('/activities'));
    assert.equal(activityCall.url.searchParams.get('time_slot[start]'), '2026-09-27T16:00:00.000Z');
    assert.equal(activityCall.url.searchParams.get('time_slot[stop]'), '2026-10-01T16:00:00.000Z');
    assert.equal(activityCall.url.searchParams.get('time_zone'), 'Asia/Manila');
  } finally {
    if (previous === undefined) delete process.env.HUBSTAFF_REPORT_TIME_ZONE;
    else process.env.HUBSTAFF_REPORT_TIME_ZONE = previous;
  }
});

test('configured report timezone is only a fallback for a missing Hubstaff account timezone', async () => {
  const previous = process.env.HUBSTAFF_REPORT_TIME_ZONE;
  process.env.HUBSTAFF_REPORT_TIME_ZONE = 'Asia/Manila';
  try {
    const data = await createEmployeeHubstaff({ ...hubstaffFixture({ timeZone: '' }),
      now: () => new Date('2026-10-01T03:00:00Z') }).dashboard(testToken, '101');
    assert.equal(data.workSummary.timeZone, 'Asia/Manila');
  } finally {
    if (previous === undefined) delete process.env.HUBSTAFF_REPORT_TIME_ZONE;
    else process.env.HUBSTAFF_REPORT_TIME_ZONE = previous;
  }
});

test('restricted time activity does not hide authorized employee assignments', async () => {
  const fixture = hubstaffFixture();
  const data = await createEmployeeHubstaff({ fetchImpl: (url, options) =>
    url.pathname.endsWith('/activities')
      ? Promise.resolve(Response.json({ error: 'forbidden' }, { status: 403 }))
      : fixture.fetchImpl(url, options) }).dashboard(testToken, '101');
  assert.equal(data.tasks.length, 1);
  assert.equal(data.workSummary.timeAvailable, false);
  assert.equal(data.workSummary.today.trackedHours, null);
  assert.equal(data.workSummary.week.trackedHours, null);
  assert.equal(data.workSummary.today.activityRate, null);
  assert.equal(data.workSummary.week.activityRate, null);
});

test('pagination loads later tasks, rejects loops, and marks bounded results incomplete', async () => {
  const base = hubstaffFixture();
  let pages = 0;
  const api = createEmployeeHubstaff({ fetchImpl: async (url, options) => {
    if (url.pathname !== '/api/v1/tasks/my/assigned') return base.fetchImpl(url, options);
    pages++;
    return Response.json({ tasks: [task({ id: pages })], pagination: pages < 2 ? { next_page_start_id: 2 } : {} });
  } });
  assert.equal((await api.dashboard(testToken, '101')).tasks.length, 2);
  const repeated = createEmployeeHubstaff({ fetchImpl: async (url, options) => url.pathname.endsWith('/assigned')
    ? Response.json({ tasks: [task()], pagination: { next_page_start_id: 2 } }) : base.fetchImpl(url, options) });
  await assert.rejects(repeated.dashboard(testToken, '101'));
  let n = 0;
  const capped = createEmployeeHubstaff({ fetchImpl: async (url, options) => url.pathname.endsWith('/assigned')
    ? Response.json({ tasks: [task({ id: ++n })], pagination: { next_page_start_id: n + 1 } }) : base.fetchImpl(url, options) });
  assert.equal((await capped.dashboard(testToken, '101')).truncated, true);
  assert.equal(n, 10);
});

test('missing identity and malformed task collections fail closed', async () => {
  const base = hubstaffFixture();
  for (const path of ['/v2/users/me', '/api/v1/members/me', '/api/v1/tasks/my/assigned']) {
    const api = createEmployeeHubstaff({ fetchImpl: (url, options) => url.pathname === path ? Promise.resolve(Response.json({})) : base.fetchImpl(url, options) });
    await assert.rejects(api.dashboard(testToken, '101'));
  }
});

test('employee encryption is randomized, authenticated, and bound to both account and mapping', () => {
  const key = 'test-only-encryption-secret-with-more-than-32-chars';
  const encrypted = encryptEmployeeToken(testToken, employeeA, key);
  assert.notEqual(encrypted, encryptEmployeeToken(testToken, employeeA, key));
  assert.equal(encrypted.includes(testToken), false);
  assert.equal(decryptEmployeeToken({ ...employeeA, encrypted_access_token: encrypted }, key), testToken);
  for (const employee of [employeeB, { ...employeeA, hubstaff_user_id: '202' }]) {
    assert.throws(() => decryptEmployeeToken({ ...employee, encrypted_access_token: encrypted }, key));
  }
  assert.throws(() => decryptEmployeeToken({ ...employeeA, encrypted_access_token: encrypted }, `${key}wrong`));
  assert.throws(() => requireActiveEmployee({ ...employeeA, is_active: false }));
  assert.throws(() => requireActiveEmployee(null));
});

test('native credential form rejects browser IDs, duplicate fields, unexpected encoding and oversized bodies', async () => {
  const form = body => new Request('https://portal.example/api/employee/connection', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
  });
  assert.equal(await readEmployeeTokenForm(form(new URLSearchParams({ token: testToken }))), testToken);
  for (const body of [`token=${testToken}&employee_id=2`, `token=${testToken}&token=another`, `token=${'x'.repeat(17000)}`]) {
    await assert.rejects(readEmployeeTokenForm(form(body)));
  }
  for (const key of ['employee_id', 'hubstaff_user_id', 'project_id', 'client_id']) {
    assert.throws(() => assertEmployeeRequest(new Request(`https://portal.example/api/employee/dashboard?${key}=2`)));
  }
});

test('task filters, date-only deadlines and completion counts match the dashboard', () => {
  const now = new Date('2026-09-30T12:00:00');
  const tasks = [
    { id: '1', title: 'Layout', projectName: 'Shop', projectId: '77', stage: 'in_progress', done: false,
      dueAt: '2026-09-30', createdAt: '2026-09-30T08:00:00Z', updatedAt: '2026-09-28T08:00:00Z' },
    { id: '2', title: 'QA', projectName: 'Shop', projectId: '77', done: false,
      dueAt: '2026-09-28', createdAt: '2026-09-28T08:00:00Z', updatedAt: '2026-09-30T08:00:00Z' },
    { id: '3', title: 'Import', projectName: 'Store', projectId: '88', done: true,
      dueAt: '2026-09-29', createdAt: '2026-09-29T08:00:00Z', updatedAt: '2026-09-29T08:00:00Z' },
  ];
  assert.equal(dueState(tasks[0], now), 'soon');
  assert.equal(dueState(tasks[1], now), 'overdue');
  assert.equal(dueState(tasks[2], now), '');
  assert.deepEqual(selectEmployeeTasks(tasks, { status: 'active' }, now).map(t => t.id), ['1', '2']);
  assert.deepEqual(selectEmployeeTasks(tasks, { status: 'active', sort: 'updated' }, now).map(t => t.id), ['2', '1']);
  assert.deepEqual(selectEmployeeTasks(tasks, { status: 'active', sort: 'created', direction: 'asc' }, now).map(t => t.id), ['2', '1']);
  assert.deepEqual(selectEmployeeTasks(tasks, { status: 'active', sort: 'updated', direction: 'asc' }, now).map(t => t.id), ['1', '2']);
  assert.deepEqual(selectEmployeeTasks(tasks, { status: 'active', sort: 'due' }, now).map(t => t.id), ['1', '2']);
  assert.deepEqual(selectEmployeeTasks(tasks, { status: 'active', sort: 'due', direction: 'asc' }, now).map(t => t.id), ['2', '1']);
  assert.deepEqual(selectEmployeeTasks(tasks, { status: 'all', search: 'import', project: '88' }, now).map(t => t.id), ['3']);
});
