import test from 'node:test';
import assert from 'node:assert/strict';
import { createEmployeeHubstaff, validateEmployeeToken } from '../../lib/employee-hubstaff.js';
import { encryptEmployeeToken, decryptEmployeeToken, requireActiveEmployee } from '../../lib/employee-repository.js';
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

test('a token for employee B cannot retrieve any tasks for employee A; identity runs first', async () => {
  const fixture = hubstaffFixture({ userId: 202 });
  await assert.rejects(createEmployeeHubstaff(fixture).dashboard(testToken, '101'), e => e.publicDetails.code === 'identity_mismatch');
  assert.equal(fixture.calls.length, 1);
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

test('only approved fields are emitted and exact credential echoes are redacted', async () => {
  const data = await createEmployeeHubstaff(hubstaffFixture({ tasks: [task({ subject: testToken, description: testToken, pay_rate: 100 })] })).dashboard(testToken, '101');
  assert.equal(JSON.stringify(data).includes(testToken), false);
  assert.equal(data.tasks[0].title, '[redacted]');
  assert.equal(data.tasks[0].description, undefined);
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
  for (const path of ['/v2/users/me', '/api/v1/tasks/my/assigned']) {
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
    { id: '1', title: 'Layout', projectName: 'Shop', projectId: '77', stage: 'in_progress', done: false, dueAt: '2026-09-30' },
    { id: '2', title: 'QA', projectName: 'Shop', projectId: '77', done: false, dueAt: '2026-09-28' },
    { id: '3', title: 'Import', projectName: 'Store', projectId: '88', done: true, dueAt: '2026-09-29' },
  ];
  assert.equal(dueState(tasks[0], now), 'soon');
  assert.equal(dueState(tasks[1], now), 'overdue');
  assert.equal(dueState(tasks[2], now), '');
  assert.deepEqual(selectEmployeeTasks(tasks, { status: 'active' }, now).map(t => t.id), ['2', '1']);
  assert.deepEqual(selectEmployeeTasks(tasks, { status: 'all', search: 'import', project: '88' }, now).map(t => t.id), ['3']);
});
