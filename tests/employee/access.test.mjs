import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { employeeA, hubstaffFixture, testToken } from './fixtures.mjs';

let session = null;
let employee = null;
let legacyQueries = 0;
let savedCiphertext = '';
let claimed = true;
const db = { query: async (query, values) => {
  if (query.startsWith('SELECT to_regclass')) return { rows: [{ relation: 'portal_employees' }] };
  if (query.includes('FROM portal_employees e')) return { rows: employee ? [employee] : [] };
  if (query.includes('SET next_request_at')) return { rowCount: claimed ? 1 : 0, rows: [] };
  if (query.includes('SET encrypted_access_token')) { savedCiphertext = values[3]; return { rowCount: 1 }; }
  if (query.includes('SET last_synced_at')) return { rowCount: 1, rows: [{ last_synced_at: new Date() }] };
  throw new Error('Unexpected SQL');
} };
mock.module('../../lib/auth.js', { namedExports: {
  auth: { api: { getSession: async () => session } },
  isPortalAuthConfigured: () => true, createPortalAuth: () => ({}),
} });
mock.module('pg', { defaultExport: { Pool: class { query(...args) { return db.query(...args); } } } });
mock.module('@neondatabase/serverless', { namedExports: { neon: () => async (strings) => {
  legacyQueries++;
  const sql = strings.join('');
  if (sql.includes('JOIN portal_admins')) return session.user.id === 'admin' ? [{ id: '30', role: 'aoc_admin', display_name: 'Fixture admin' }] : [];
  if (sql.includes('WITH synced_user')) return session.user.id === 'client' ? [{ id: '7', portal_user_id: '40', slug: 'fixture-client', role: 'client_admin', display_name: 'Fixture client' }] : [];
  return [];
} } });
process.env.DATABASE_URL = 'postgresql://fixture.invalid/unused';
process.env.BETTER_AUTH_URL = 'https://portal.example';
process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY = 'test-only-employee-key-more-than-32-characters';
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

const { resolvePortalContext, loadPortalAiAccess } = await import('../../lib/portal-data.js');
const { resolveAdminContext } = await import('../../lib/admin-data.js');
const { resolveEmployeeContext } = await import('../../lib/employee-data.js');
const { GET: employeeDashboard } = await import('../../app/api/employee/dashboard/route.js');
const { POST: connect } = await import('../../app/api/employee/connection/route.js');
const { POST: chatkit } = await import('../../app/api/chatkit/route.js');
const { GET: clientHubstaff } = await import('../../app/api/hubstaff/route.js');
const { GET: builder } = await import('../../app/api/builder/route.js');
const headers = new Headers({ origin: 'https://portal.example' });
const request = (path, method = 'GET', body) => new Request(`https://portal.example${path}`, {
  method, headers: { origin: 'https://portal.example', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body,
});

test('unauthenticated employee endpoints reject access', async () => {
  session = null;
  assert.equal((await employeeDashboard(request('/api/employee/dashboard'))).status, 401);
  assert.equal((await connect(request('/api/employee/connection', 'POST', new URLSearchParams({ token: testToken })))).status, 401);
});

test('existing client and admin context paths keep their memberships and roles', async () => {
  employee = null;
  session = { user: { id: 'client', name: 'Client' } };
  assert.equal((await resolvePortalContext(headers)).client.slug, 'fixture-client');
  await assert.rejects(resolveEmployeeContext(headers), e => e.publicDetails.status === 403);
  session = { user: { id: 'admin', name: 'Admin' } };
  assert.equal((await resolveAdminContext(headers)).admin.role, 'aoc_admin');
  await assert.rejects(resolveEmployeeContext(headers), e => e.publicDetails.status === 403);
});

test('employees, including inactive or accidentally dual-role accounts, cannot enter client/admin paths', async () => {
  session = { user: { id: 'admin', name: 'Employee' } };
  for (const is_active of [true, false]) {
    employee = { ...employeeA, is_active };
    const before = legacyQueries;
    for (const resolve of [resolvePortalContext, resolveAdminContext, loadPortalAiAccess]) {
      await assert.rejects(resolve(headers), e => e.publicDetails.code === 'employee_only');
    }
    assert.equal(legacyQueries, before, 'Reject before querying legacy data');
    assert.equal((await chatkit(request('/api/chatkit', 'POST'))).status, 403);
    assert.equal((await clientHubstaff(request('/api/hubstaff?project_id=999'))).status, 403);
    assert.equal((await builder(request('/api/builder?client_id=999'))).status, 403);
  }
});

test('active employee endpoint returns no legacy state and refuses every browser-selected identity', async () => {
  employee = { ...employeeA };
  session = { user: { id: 'employee-a', name: 'Employee A' } };
  assert.equal((await resolveEmployeeContext(headers)).profile.name, employeeA.display_name);
  const response = await employeeDashboard(request('/api/employee/dashboard'));
  assert.deepEqual((await response.json()).tasks, []);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  for (const key of ['employee_id', 'hubstaff_user_id', 'project_id', 'client_id']) {
    assert.equal((await employeeDashboard(request(`/api/employee/dashboard?${key}=2`))).status, 400);
  }
});

test('connection POST validates identity, stores ciphertext only, rejects origin/body injection and rate-limits', async () => {
  employee = { ...employeeA };
  const fixture = hubstaffFixture();
  globalThis.fetch = fixture.fetchImpl;
  let response = await connect(request('/api/employee/connection', 'POST', new URLSearchParams({ token: testToken })));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/employee?connection=connected');
  assert.equal(savedCiphertext.startsWith('v1.'), true);
  assert.equal(savedCiphertext.includes(testToken), false);
  assert.equal((await response.text()).includes(testToken), false);
  const calls = fixture.calls.length;
  response = await connect(new Request('https://portal.example/api/employee/connection', { method: 'POST', headers: { origin: 'https://evil.example' } }));
  assert.equal(response.status, 403);
  response = await connect(request('/api/employee/connection', 'POST', new URLSearchParams({ token: testToken, hubstaff_user_id: '202' })));
  assert.equal(response.headers.get('location'), '/employee?connection=invalid_request');
  assert.equal(fixture.calls.length, calls);
  claimed = false;
  response = await connect(request('/api/employee/connection', 'POST', new URLSearchParams({ token: testToken })));
  assert.equal(response.headers.get('location'), '/employee?connection=refresh_limited');
  assert.equal(fixture.calls.length, calls);
  claimed = true;
  globalThis.fetch = hubstaffFixture({ userId: 202 }).fetchImpl;
  const saved = savedCiphertext;
  response = await connect(request('/api/employee/connection', 'POST', new URLSearchParams({ token: testToken })));
  assert.equal(response.headers.get('location'), '/employee?connection=identity_mismatch');
  assert.equal(savedCiphertext, saved, 'A failed connection never overwrites the working one');
});
