import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { internalUserA, internalUserB, hubstaffFixture, testToken } from './fixtures.mjs';
import { INTERNAL_HR_PANEL_IDS, INTERNAL_PM_PANEL_IDS } from '../../lib/internal-user-positions.js';

let session = null;
let internalUser = null;
let legacyQueries = 0;
let savedCiphertext = '';
let claimed = true;
let roles = [];
let targetInternalUser = null;
let targetRoles = [];
let activeManagerCount = 2;
const roleAudit = [];
const portalAuditEvents = [];
const panelAudit = [];
const integrationRuns = [];
let pagedAuditRuns = null;
let pagedAuditEvents = null;
const profileUpdates = [];
const db = { query: async (query, values) => {
  if (['BEGIN', 'COMMIT', 'ROLLBACK', 'LOCK TABLE portal_internal_user_roles IN SHARE ROW EXCLUSIVE MODE'].includes(query)) {
    return { rows: [] };
  }
  if (query.includes("r.role_key IN ('internal_access_manager','internal_admin')")) {
    return { rows: roles.filter(role => ['internal_access_manager', 'internal_admin'].includes(role))
      .map(role_key => ({ role_key })) };
  }
  if (query.startsWith('SELECT is_active FROM portal_internal_users WHERE user_id=')) {
    return { rows: targetInternalUser ? [{ is_active: targetInternalUser.is_active }] : [] };
  }
  if (query.includes('SELECT COUNT(*)::int AS count FROM portal_internal_user_roles')) {
    return { rows: [{ count: activeManagerCount }] };
  }
  if (query.startsWith('DELETE FROM portal_internal_user_roles')) {
    const role = values[1] || 'internal_access_manager';
    const selectedRoles = values[0] === '1' ? roles : targetRoles;
    const assigned = selectedRoles.includes(role);
    if (values[0] === '1') roles = roles.filter(candidate => candidate !== role);
    else targetRoles = targetRoles.filter(candidate => candidate !== role);
    return { rowCount: Number(assigned), rows: assigned ? [{ user_id: values[0] }] : [] };
  }
  if (query.startsWith('INSERT INTO portal_internal_user_roles')) {
    const selectedRoles = values[0] === '1' ? roles : targetRoles;
    const assigned = selectedRoles.includes(values[1]);
    if (!assigned && values[0] === '1') roles = [...roles, values[1]];
    else if (!assigned) targetRoles = [...targetRoles, values[1]];
    return { rowCount: Number(!assigned), rows: assigned ? [] : [{ user_id: values[0] }] };
  }
  if (query.startsWith('UPDATE portal_internal_users\n        SET panel_access')) {
    const user = values[0] === '1' ? internalUser : targetInternalUser;
    if (user && !values[2].some(panel => user.panel_access.includes(panel))) {
      user.panel_access = [...user.panel_access, ...JSON.parse(values[1])];
    }
    return { rowCount: 1, rows: [] };
  }
  if (query.startsWith('INSERT INTO portal_internal_access_audit')) {
    if (query.includes("'panel.read.' || selected.panel_id")) {
      panelAudit.push(...values[1].map(panel => ({ actor: values[0], panel })));
      portalAuditEvents.push(...values[1].map((panel, index) => ({ id: portalAuditEvents.length + index + 1,
        actor_user_id: values[0], target_user_id: values[0], action: `panel.read.${panel}`,
        occurred_at: new Date() })));
      return { rowCount: values[1].length, rows: [] };
    }
    roleAudit.push(values);
    portalAuditEvents.push({ id: portalAuditEvents.length + 1, actor_user_id: values[0],
      target_user_id: values[0], action: values[1], occurred_at: new Date() });
    return { rowCount: 1, rows: [] };
  }
  if (query.startsWith('INSERT INTO portal_integration_runs')) {
    const id = integrationRuns.length + 1;
    integrationRuns.push({ id, source: values[0], operation: values[1], actor_user_id: values[2],
      environment: values[3], trigger_type: values[4], request_id: values[5], status: 'running' });
    return { rowCount: 1, rows: [{ id }] };
  }
  if (query.startsWith('UPDATE portal_integration_runs')) {
    const run = integrationRuns.find(item => item.id === values[0] && item.status === 'running');
    if (run) Object.assign(run, { status: values[1], records_processed: values[2], retry_count: values[3],
      source_timestamp: values[4], error_code: values[5], records_read: values[6],
      records_written: values[7], records_skipped: values[8], records_failed: values[9],
      retry_state: values[10], started_at: new Date(), finished_at: new Date() });
    return { rowCount: Number(Boolean(run)), rows: [] };
  }
  if (query.includes("to_regclass('portal_integration_runs') AS runs")) {
    return { rows: [{ runs: 'portal_integration_runs', access_audit: 'portal_internal_access_audit' }] };
  }
  if (query.includes("SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC'")) {
    return { rows: [{ audit_as_of: new Date().toISOString() }] };
  }
  if (query.includes('FROM portal_integration_runs WHERE started_at <= $1')) {
    return { rows: (pagedAuditRuns || integrationRuns.toReversed()).slice(values[2], values[2] + values[1]) };
  }
  if (query.includes('FROM portal_internal_access_audit WHERE occurred_at <= $1')) {
    return { rows: (pagedAuditEvents || portalAuditEvents.toReversed()).slice(values[2], values[2] + values[1]) };
  }
  if (query.includes('WITH changed_internalUser AS')) {
    profileUpdates.push(values);
    internalUser = { ...internalUser, position: values[0], panel_access: JSON.parse(values[1]),
      display_name: values.at(-1) };
    return { rows: [{ user_id: internalUser.user_id }] };
  }
  if (query.includes("to_regclass('portal_internal_users') AS users")) return { rows: [{ users: 'portal_internal_users',
    roles: 'portal_internal_user_roles', audit: 'portal_internal_access_audit' }] };
  if (query.startsWith('SELECT to_regclass')) return { rows: [{ relation: 'portal_internal_users' }] };
  if (query.includes('SELECT 1 FROM portal_internal_users WHERE hubstaff_user_id')) return { rows: [] };
  if (query === 'SELECT hubstaff_user_id, position FROM portal_internal_users') {
    return { rows: [internalUser, targetInternalUser].filter(Boolean) };
  }
  if (query.includes('FROM portal_internal_users e JOIN portal_users u')) {
    return { rows: internalUser ? [{ ...internalUser, connected: Boolean(internalUser.encrypted_access_token) },
      ...(targetInternalUser ? [{ ...targetInternalUser,
        connected: Boolean(targetInternalUser.encrypted_access_token) }] : [])] : [] };
  }
  if (query.includes('FROM portal_internal_users e')) return { rows: internalUser ? [internalUser] : [] };
  if (query.includes('FROM portal_internal_user_roles WHERE user_id=')) return { rows: roles.map(role_key => ({ role_key })) };
  if (query.includes('FROM portal_internal_users AS internalUser')) return { rows: internalUser ? [{ ...internalUser,
    username: 'fixture.manager', email: 'fixture@example.invalid', roles,
    connected: false, last_synced_at: null, created_at: new Date('2026-01-01'),
  }, ...(targetInternalUser ? [{ ...targetInternalUser, username: 'fixture.target',
    email: 'target@example.invalid', roles: targetRoles, connected: false,
    last_synced_at: null, created_at: new Date('2026-01-01') }] : [])] : [] };
  if (query.includes('JOIN portal_admins')) {
    legacyQueries++;
    return { rows: session.user.id === 'admin' ? [{ id: '30', role: 'aoc_admin', display_name: 'Fixture admin' }] : [] };
  }
  if (query.includes('WITH synced_user')) {
    legacyQueries++;
    return { rows: session.user.id === 'client' ? [{ id: '7', portal_user_id: '40', slug: 'fixture-client', role: 'client_admin', display_name: 'Fixture client' }] : [] };
  }
  if (query.includes('SET next_request_at')) return { rowCount: claimed ? 1 : 0, rows: [] };
  if (query.includes('SELECT encrypted_refresh_token, access_expires_at')) return { rows: [] };
  if (query.startsWith('WITH disconnected AS')) {
    assert.match(query, /encrypted_access_token=NULL, encrypted_refresh_token=NULL/);
    assert.match(query, /hubstaff_connection_kind='pat'/);
    assert.match(query, /'hubstaff\.connection\.unlink'/);
    if (!internalUser?.encrypted_access_token || values[0] !== internalUser.user_id
      || values[1] !== internalUser.hubstaff_user_id
      || values[2] !== internalUser.connection_version) return { rowCount: 0, rows: [] };
    internalUser = { ...internalUser, encrypted_access_token: null, encrypted_refresh_token: null,
      access_expires_at: null, hubstaff_connection_kind: 'pat', last_synced_at: null,
      next_request_at: null, connection_version: String(Number(internalUser.connection_version) + 1) };
    roleAudit.push([internalUser.user_id, internalUser.user_id, 'hubstaff.connection.unlink']);
    return { rowCount: 1, rows: [{ target_user_id: internalUser.user_id }] };
  }
  if (query.includes('SET encrypted_access_token')) { savedCiphertext = values[3]; return { rowCount: 1 }; }
  if (query.includes('SET last_synced_at')) return { rowCount: 1, rows: [{ last_synced_at: new Date() }] };
  throw new Error('Unexpected SQL');
} };
mock.module('../../lib/auth.js', { namedExports: {
  auth: { api: { getSession: async () => session } },
  isPortalAuthConfigured: () => true, createPortalAuth: () => ({}),
} });
mock.module('pg', { defaultExport: { Pool: class {
  query(...args) { return db.query(...args); }
  async connect() { return { query: (...args) => db.query(...args), release() {} }; }
} } });
process.env.DATABASE_URL = 'postgresql://fixture.invalid/unused';
process.env.BETTER_AUTH_URL = 'https://portal.example';
process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY = 'test-only-internal-user-key-more-than-32-characters';
const originalFetch = globalThis.fetch;
after(() => { globalThis.fetch = originalFetch; });

const { resolvePortalContext, loadPortalAiAccess } = await import('../../lib/portal-data.js');
const { resolveAdminContext } = await import('../../lib/admin-data.js');
const { resolveInternalUserContext } = await import('../../lib/internal-user-data.js');
const { encryptInternalUserToken, unlinkInternalUserConnection } = await import('../../lib/internal-user-repository.js');
const { GET: internalUserDashboard } = await import('../../app/api/internal/dashboard/route.js');
const { GET: platformAudit } = await import('../../app/api/internal/audit/route.js');
const { GET: hrDashboard } = await import('../../app/api/internal/hr/route.js');
const { GET: pmDashboard } = await import('../../app/api/internal/project-management/route.js');
const { GET: internalUsersGet, POST: internalUsersPost, PATCH: internalUsersPatch, PUT: internalUsersPut,
} = await import('../../app/api/internal/internal-users/route.js');
const { GET: availableHubstaffMembers } = await import('../../app/api/internal/hubstaff-members/route.js');
const { POST: connect } = await import('../../app/api/internal/connection/route.js');
const { POST: unlink } = await import('../../app/api/internal/connection/unlink/route.js');
const { POST: chatkit } = await import('../../app/api/chatkit/route.js');
const { GET: clientHubstaff } = await import('../../app/api/hubstaff/route.js');
const { GET: builder } = await import('../../app/api/builder/route.js');
const headers = new Headers({ origin: 'https://portal.example' });
const request = (path, method = 'GET', body) => new Request(`https://portal.example${path}`, {
  method, headers: { origin: 'https://portal.example', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body,
});

function mockTeamRoster(t, { token = 'hsoat_fixture_token', timeOffRequests = [], balances = [], policies = [],
  schedules = [], members = [
  { id: 101, name: 'AOC Member One' }, { id: 202, name: 'AOC Member Two' },
] } = {}) {
  const previousToken = process.env.HUBSTAFF_ACCESS_TOKEN;
  const previousTeamId = process.env.HUBSTAFF_INTERNAL_TEAM_ID;
  const previousFetch = globalThis.fetch;
  process.env.HUBSTAFF_ACCESS_TOKEN = token;
  process.env.HUBSTAFF_INTERNAL_TEAM_ID = '77';
  globalThis.fetch = async url => {
    if (url.pathname === '/v2/organizations') return Response.json({ organizations: [{ id: 7 }] });
    if (url.pathname === '/v2/organizations/7/teams') {
      return Response.json({ teams: [{ id: 77, name: 'AOC members' }] });
    }
    if (url.pathname === '/v2/teams/77/members') {
      return Response.json({ team_members: members.map(member => ({ user_id: member.id })) });
    }
    if (url.pathname === '/v2/organizations/7/members') {
      return Response.json({ members: members.map(member => ({ user_id: member.id, membership_status: 'active' })),
        users: members.map(member => ({ id: member.id, name: member.name,
          status: 'active', time_zone: 'Asia/Manila' })) });
    }
    if (url.pathname.endsWith('/time_off_requests')) return Response.json({ time_off_requests: timeOffRequests });
    if (url.pathname.endsWith('/time_off_balances')) return Response.json({ time_off_balances: balances });
    if (url.pathname.endsWith('/time_off_policies')) return Response.json({ time_off_policies: policies });
    if (url.pathname.endsWith('/attendance_schedules')) return Response.json({ attendance_schedules: schedules });
    throw new Error(`Unexpected Hubstaff route: ${url.pathname}`);
  };
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.HUBSTAFF_ACCESS_TOKEN;
    else process.env.HUBSTAFF_ACCESS_TOKEN = previousToken;
    if (previousTeamId === undefined) delete process.env.HUBSTAFF_INTERNAL_TEAM_ID;
    else process.env.HUBSTAFF_INTERNAL_TEAM_ID = previousTeamId;
  });
}

test('unauthenticated internal user endpoints reject access', async () => {
  session = null;
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard'))).status, 401);
  assert.equal((await connect(request('/api/internal/connection', 'POST', new URLSearchParams({ token: testToken })))).status, 401);
});

test('existing client and admin context paths keep their memberships and roles', async () => {
  internalUser = null;
  session = { user: { id: 'client', name: 'Client' } };
  assert.equal((await resolvePortalContext(headers)).client.slug, 'fixture-client');
  await assert.rejects(resolveInternalUserContext(headers), e => e.publicDetails.status === 403);
  session = { user: { id: 'admin', name: 'Admin' } };
  assert.equal((await resolveAdminContext(headers)).admin.role, 'aoc_admin');
  await assert.rejects(resolveInternalUserContext(headers), e => e.publicDetails.status === 403);
});

test('internal users, including inactive or accidentally dual-access accounts, cannot enter client/admin paths', async () => {
  session = { user: { id: 'admin', name: 'InternalUser' } };
  for (const is_active of [true, false]) {
    internalUser = { ...internalUserA, is_active };
    const before = legacyQueries;
    for (const resolve of [resolvePortalContext, resolveAdminContext, loadPortalAiAccess]) {
      await assert.rejects(resolve(headers), e => e.publicDetails.code === 'internal_user_only');
    }
    assert.equal(legacyQueries, before, 'Reject before querying legacy data');
    assert.equal((await chatkit(request('/api/chatkit', 'POST'))).status, 403);
    assert.equal((await clientHubstaff(request('/api/hubstaff?project_id=999'))).status, 403);
    assert.equal((await builder(request('/api/builder?client_id=999'))).status, 403);
  }
});

test('active internal user endpoint returns no legacy state and refuses every browser-selected identity', async t => {
  mockTeamRoster(t);
  internalUser = { ...internalUserA };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  const context = await resolveInternalUserContext(headers);
  assert.equal(context.profile.name, internalUserA.display_name);
  assert.equal(context.profile.position, 'Team Member');
  assert.deepEqual(context.profile.panels, ['overview', 'my_tasks', 'activity', 'team_directory', 'account_settings', 'hubstaff']);
  const response = await internalUserDashboard(request('/api/internal/dashboard'));
  assert.deepEqual((await response.json()).tasks, []);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const teamResponse = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
  assert.equal(teamResponse.status, 200);
  const team = (await teamResponse.json()).teamMembers;
  assert.equal(team.length, 2);
  assert.deepEqual(Object.keys(team[0]).sort(), ['id', 'name', 'portalAccountMapped', 'position', 'workStatus']);
  assert.deepEqual(team.map(member => member.portalAccountMapped), [true, false]);
  assert.equal(team[1].position, null);
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'))).status, 200);
  for (const key of ['internal_user_id', 'hubstaff_user_id', 'project_id', 'client_id']) {
    assert.equal((await internalUserDashboard(request(`/api/internal/dashboard?${key}=2`))).status, 400);
  }
});

test('Project Management role does not expand the shared Team directory fields', async t => {
  mockTeamRoster(t);
  internalUser = { ...internalUserA, position: 'project_manager', panel_access: undefined };
  roles = ['project_management'];
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  const beforeAudit = integrationRuns.length;
  const response = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.access.position, 'Project Manager');
  assert.equal(payload.access.panels.includes('team_directory'), true);
  assert.equal(payload.teamMembers.length, 2);
  assert.deepEqual(Object.keys(payload.teamMembers[0]).sort(),
    ['id', 'name', 'portalAccountMapped', 'position', 'workStatus']);
  const directoryRun = integrationRuns.slice(beforeAudit).find(run => run.operation === 'team_directory');
  assert.equal(directoryRun?.source, 'hubstaff');
  assert.equal(directoryRun?.status, 'succeeded');
  assert.equal(directoryRun?.records_processed, 2);
  assert.equal(directoryRun?.actor_user_id, internalUserA.user_id);
  roles = [];
});

test('inactive internal users cannot use live panel or Internal Settings APIs', async () => {
  internalUser = { ...internalUserA, is_active: false };
  roles = ['internal_admin'];
  session = { user: { id: 'internal-user-a', name: 'Inactive Internal User' } };
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=personal'))).status, 403);
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=team'))).status, 403);
  assert.equal((await internalUsersGet(request('/api/internal/internal-users'))).status, 403);
  roles = [];
});

test('Team defaults from position when panel access is unset, but an explicit omission denies access', async t => {
  mockTeamRoster(t);
  internalUser = { ...internalUserA, position: 'project_manager', panel_access: undefined };
  roles = [];
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  const teamResponse = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
  assert.equal(teamResponse.status, 200);
  assert.deepEqual(Object.keys((await teamResponse.json()).teamMembers[0]).sort(),
    ['id', 'name', 'portalAccountMapped', 'position', 'workStatus']);
  internalUser = { ...internalUserA, panel_access: ['overview'] };
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=team'))).status, 403);
  assert.equal((await resolveInternalUserContext(headers)).profile.panels.includes('team_directory'), false);
});

test('Team never exposes other users connection status, including to account managers', async t => {
  mockTeamRoster(t);
  internalUser = { ...internalUserA, panel_access: ['overview', 'team_directory'] };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  for (const assignedRoles of [[], ['project_management'], ['hr'], ['internal_access_manager'], ['internal_admin']]) {
    roles = assignedRoles;
    const response = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload.teamMembers[0]).sort(),
      ['id', 'name', 'portalAccountMapped', 'position', 'workStatus']);
    assert.equal(Object.hasOwn(payload.access, 'teamTasksAvailable'), false);
  }
  roles = [];
});

test('Team status uses the organization reader for mapped and unmapped AOC members', async t => {
  internalUser = { ...internalUserA, panel_access: ['team_directory'] };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  roles = [];
  const now = Date.now();
  mockTeamRoster(t, { token: 'hsoat_fixture_status_token', timeOffRequests: [{
      user_id: 101, status: 'approved', message: 'private leave reason',
      starts_at: new Date(now - 3_600_000).toISOString(),
      stops_at: new Date(now + 3_600_000).toISOString(),
      time_off_request_days: [{ amount_used: 3600,
        starts_at: new Date(now - 3_600_000).toISOString(),
        stops_at: new Date(now + 3_600_000).toISOString() }],
    }] });
  const response = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.deepEqual(payload.teamMembers, [
    { id: 'team-member-1', name: 'AOC Member One', position: 'Team Member',
      portalAccountMapped: true, workStatus: 'Away' },
    { id: 'team-member-2', name: 'AOC Member Two', position: null,
      portalAccountMapped: false, workStatus: 'Unknown' },
  ]);
  assert.equal(JSON.stringify(payload).includes('private leave reason'), false);
  assert.equal(JSON.stringify(payload).includes('hubstaffUserId'), false);
  assert.equal(JSON.stringify(payload).includes('101'), false);
  assert.equal(integrationRuns.at(-1)?.operation, 'team_work_status');
  assert.equal(integrationRuns.at(-1)?.status, 'succeeded');
});

test('Team does not substitute a partial portal roster when AOC membership cannot be verified', async t => {
  mockTeamRoster(t);
  delete process.env.HUBSTAFF_INTERNAL_TEAM_ID;
  internalUser = { ...internalUserA, panel_access: ['team_directory'] };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  roles = [];
  const beforeAudit = integrationRuns.length;
  const response = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
  assert.equal(response.status, 503);
  const body = await response.json();
  assert.equal(body.code, 'team_directory_unavailable');
  assert.equal(JSON.stringify(body).includes(internalUserA.display_name), false);
  const directoryRun = integrationRuns.slice(beforeAudit).find(run => run.operation === 'team_directory');
  assert.equal(directoryRun?.status, 'failed');
  assert.equal(directoryRun?.error_code, 'hubstaff_team_not_configured');
});

test('HR endpoint allows HR and Internal Admin, and returns only AOC members with approved fields', async t => {
  const now = new Date();
  const date = now.toISOString().slice(0, 10);
  const startAt = new Date(now.valueOf() - 3_600_000).toISOString();
  const stopAt = new Date(now.valueOf() + 3_600_000).toISOString();
  const leave = (id, userId, status, message) => ({ id, user_id: userId,
    time_off_policy_id: 9, status, message, starts_at: startAt, stops_at: stopAt,
    time_off_request_days: [{ date, amount_used: 3600, starts_at: startAt, stops_at: stopAt }] });
  mockTeamRoster(t, {
    timeOffRequests: [leave(1, 101, 'approved', 'Private HR reason'),
      leave(2, 202, 'submitted', 'Pending reason'), leave(3, 303, 'approved', 'Outsider reason')],
    balances: [{ user_id: 101, time_off_policy_id: 9, policy_name: 'Annual leave', amount: 36000 },
      { user_id: 202, time_off_policy_id: 9, policy_name: 'Annual leave', amount: 18000 },
      { user_id: 303, time_off_policy_id: 9, policy_name: 'Annual leave', amount: 72000 }],
    policies: [{ id: 9, name: 'Annual leave' }],
    schedules: [{ user_id: 101, start_date: '2026-01-01', start_time: '09:00', duration: 28800,
      repeat_schedule: 'weekly', use_time_zone: 'user', weekdays: ['mon'], excluded_dates: [] },
    { user_id: 303, start_date: '2026-01-01', start_time: '09:00', duration: 28800,
      repeat_schedule: 'weekly', use_time_zone: 'user', weekdays: ['mon'], excluded_dates: [] }],
  });
  internalUser = { ...internalUserA, panel_access: [...internalUserA.panel_access, ...INTERNAL_HR_PANEL_IDS] };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  const path = `/api/internal/hr?month=${date.slice(0, 7)}`;
  roles = [];
  const beforeAudit = integrationRuns.length;
  assert.equal((await hrDashboard(request(path))).status, 403);
  assert.equal(integrationRuns.length, beforeAudit, 'Denied roles never read or audit HR data');
  roles = ['internal_admin'];
  const adminResponse = await hrDashboard(request(path));
  assert.equal(adminResponse.status, 200);
  assert.equal((await adminResponse.json()).leaveRequests[0].reason, 'Private HR reason');
  roles = ['hr'];
  const beforePanelAudit = panelAudit.length;
  const response = await hrDashboard(request(path));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const payload = await response.json();
  assert.equal(payload.people.length, 2);
  assert.deepEqual(payload.people.map(person => person.portalAccountMapped), [true, false]);
  assert.equal(payload.people[0].scheduleCoverage, 'On file');
  assert.equal(payload.people[1].scheduleCoverage, 'Missing');
  assert.equal(payload.leaveRequests.length, 2);
  assert.equal(payload.calendarRequests.length, 1);
  assert.equal(Object.hasOwn(payload.calendarRequests[0], 'reason'), false);
  assert.equal(payload.leaveRequests[0].reason, 'Private HR reason');
  assert.equal(payload.balances.length, 2);
  assert.equal(payload.summary.scheduleCoverage, 1);
  assert.deepEqual(panelAudit.slice(beforePanelAudit).map(event => event.panel), INTERNAL_HR_PANEL_IDS);
  assert.equal(JSON.stringify(payload).includes('Outsider reason'), false);
  assert.equal(JSON.stringify(payload).includes('userId'), false);
  assert.equal(JSON.stringify(payload).includes('hubstaff_user_id'), false);
  assert.equal(integrationRuns.at(-1).operation, 'hr_dashboard');
  assert.equal(integrationRuns.at(-1).status, 'succeeded');
  internalUser.panel_access = ['hr_leave_calendar'];
  const calendarOnly = await hrDashboard(request(path));
  assert.equal(calendarOnly.status, 200);
  const calendarPayload = await calendarOnly.json();
  assert.equal(calendarPayload.summary, null);
  assert.equal(calendarPayload.leaveRequests.length, 0);
  assert.equal(calendarPayload.balances.length, 0);
  assert.equal(Object.hasOwn(calendarPayload.people[0], 'schedules'), false);
  assert.equal(calendarPayload.calendarRequests.length, 1);
  assert.equal(panelAudit.at(-1).panel, 'hr_leave_calendar');
  assert.equal((await hrDashboard(request('/api/internal/hr?month=2026-99'))).status, 400);
  internalUser.panel_access = [];
  assert.equal((await hrDashboard(request(path))).status, 403);
  roles = [];
});

test('Project Management API rejects missing roles, disabled panels, and invalid project requests', async () => {
  internalUser = { ...internalUserA, position: 'project_manager', panel_access: [...INTERNAL_PM_PANEL_IDS] };
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  roles = [];
  const beforeRuns = integrationRuns.length;
  const beforePanels = panelAudit.length;
  assert.equal((await pmDashboard(request('/api/internal/project-management'))).status, 403);
  assert.equal(integrationRuns.length, beforeRuns);
  roles = ['project_management'];
  internalUser.panel_access = [];
  assert.equal((await pmDashboard(request('/api/internal/project-management'))).status, 403);
  internalUser.panel_access = ['pm_projects'];
  assert.equal((await pmDashboard(request('/api/internal/project-management?project_id=1'))).status, 403);
  assert.equal((await pmDashboard(request('/api/internal/project-management?project_id=bad'))).status, 400);
  assert.equal((await pmDashboard(request('/api/internal/project-management?refresh=0'))).status, 400);
  assert.equal((await pmDashboard(request('/api/internal/project-management?other=1'))).status, 400);
  assert.equal(integrationRuns.length, beforeRuns);
  assert.equal(panelAudit.length, beforePanels);
  roles = [];
});

test('HR source failure returns no partial records and records an audit failure', async t => {
  mockTeamRoster(t);
  const rosterFetch = globalThis.fetch;
  globalThis.fetch = url => url.pathname.endsWith('/time_off_balances')
    ? Promise.resolve(Response.json({}, { status: 403 })) : rosterFetch(url);
  internalUser = { ...internalUserA, panel_access: [...internalUserA.panel_access, ...INTERNAL_HR_PANEL_IDS] };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  roles = ['hr'];
  const response = await hrDashboard(request(`/api/internal/hr?month=${new Date().toISOString().slice(0, 7)}`));
  assert.equal(response.status, 503);
  assert.equal(Object.hasOwn(await response.json(), 'people'), false);
  assert.equal(integrationRuns.at(-1).operation, 'hr_dashboard');
  assert.equal(integrationRuns.at(-1).status, 'failed');
  assert.equal(integrationRuns.at(-1).error_code, 'hubstaff_forbidden');
  roles = [];
});

test('each live personal panel filters dashboard data independently', async () => {
  roles = [];
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  globalThis.fetch = hubstaffFixture().fetchImpl;
  const connectedUser = panel => {
    const user = { ...internalUserA, panel_access: [panel] };
    return { ...user, encrypted_access_token: encryptInternalUserToken(testToken, user,
      process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY) };
  };
  internalUser = connectedUser('my_tasks');
  const taskResponse = await internalUserDashboard(request('/api/internal/dashboard?workspace=personal'));
  assert.equal(taskResponse.status, 200);
  const taskData = await taskResponse.json();
  assert.equal(typeof taskData.tasks[0].description, 'string');
  assert.equal(Object.hasOwn(taskData, 'workSummary'), false);
  internalUser = connectedUser('activity');
  const activityResponse = await internalUserDashboard(request('/api/internal/dashboard?workspace=personal'));
  assert.equal(activityResponse.status, 200);
  const activityData = await activityResponse.json();
  assert.equal(activityData.tasks.length > 0, true);
  assert.equal(Object.hasOwn(activityData.tasks[0], 'description'), false);
  assert.equal(Object.hasOwn(activityData, 'workSummary'), false);
  assert.deepEqual(activityData.projects, []);
  internalUser = { ...internalUserA, panel_access: [] };
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=personal'))).status, 403);
});

test('personal Settings requires an enabled panel; a planned role cannot open Internal Settings', async () => {
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  internalUser = { ...internalUserA, panel_access: ['overview'] };
  roles = ['sales'];
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'))).status, 403);
  assert.equal((await internalUsersGet(request('/api/internal/internal-users'))).status, 403);
  roles = [];
  internalUser = { ...internalUserA, panel_access: ['account_settings'] };
  const accountOnly = await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'));
  assert.equal(accountOnly.status, 200);
  assert.equal(Object.hasOwn(await accountOnly.json(), 'connection'), false);
  internalUser = { ...internalUserA, panel_access: ['hubstaff'] };
  const hubstaffOnly = await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'));
  assert.equal(hubstaffOnly.status, 200);
  assert.equal(Object.hasOwn(await hubstaffOnly.json(), 'connection'), true);
});

test('successful live-panel reads are audited; forbidden panel requests are not', async () => {
  roles = [];
  internalUser = { ...internalUserA, panel_access: ['account_settings'] };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  const before = panelAudit.length;
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'))).status, 200);
  assert.deepEqual(panelAudit.slice(before), [{ actor: '1', panel: 'account_settings' }]);
  internalUser.panel_access = [];
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'))).status, 403);
  assert.equal(panelAudit.length, before + 1);
});

test('non-manager cannot read or create internal user accounts through the new API', async () => {
  internalUser = { ...internalUserA };
  roles = ['project_management'];
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  assert.equal((await internalUsersGet(request('/api/internal/internal-users'))).status, 403);
  assert.equal((await availableHubstaffMembers(request('/api/internal/hubstaff-members'))).status, 403);
  const create = new Request('https://portal.example/api/internal/internal-users', {
    method: 'POST', headers: { origin: 'https://portal.example', 'content-type': 'application/json' },
    body: JSON.stringify({ name: 'Not authorized' }),
  });
  assert.equal((await internalUsersPost(create)).status, 403);
  const assign = new Request('https://portal.example/api/internal/internal-users', {
    method: 'PUT', headers: { origin: 'https://portal.example', 'content-type': 'application/json' },
    body: JSON.stringify({ id: '2', role: 'hr', assigned: true }),
  });
  assert.equal((await internalUsersPut(assign)).status, 403);
  roles = [];
});

test('account managers default to AOC members, can list other unmapped organization members, and cannot submit outsiders', async () => {
  internalUser = { ...internalUserA };
  targetInternalUser = { ...internalUserB, is_active: false };
  roles = ['internal_access_manager'];
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  const previousToken = process.env.HUBSTAFF_ACCESS_TOKEN;
  const previousTeamId = process.env.HUBSTAFF_INTERNAL_TEAM_ID;
  const previousFetch = globalThis.fetch;
  process.env.HUBSTAFF_ACCESS_TOKEN = 'hsoat_fixture_token';
  process.env.HUBSTAFF_INTERNAL_TEAM_ID = '77';
  globalThis.fetch = async url => {
    if (url.pathname === '/v2/organizations') {
      return Response.json({ organizations: [{ id: 9 }], pagination: {} });
    }
    if (url.pathname === '/v2/organizations/9/teams') {
      return Response.json({ teams: [{ id: 77, name: 'AOC members' }], pagination: {} });
    }
    if (url.pathname === '/v2/teams/77/members') {
      return Response.json({ team_members: [
        { user_id: 101 }, { user_id: 202 }, { user_id: 303 }, { user_id: 404 },
      ], pagination: {} });
    }
    if (url.pathname === '/v2/organizations/9/members') {
      return Response.json({ members: [
        { user_id: 101, membership_status: 'active' },
        { user_id: 202, membership_status: 'active' },
        { user_id: 303, membership_status: 'active' },
        { user_id: 404, membership_status: 'inactive' },
        { user_id: 505, membership_status: 'active' },
      ], users: [
        { id: 101, name: 'Already mapped', status: 'active' },
        { id: 202, name: 'Inactive portal account mapping', status: 'active' },
        { id: 303, name: 'Available Member', status: 'active', email: 'private@example.invalid' },
        { id: 404, name: 'Inactive Member', status: 'active' },
        { id: 505, name: 'Outside AOC team', status: 'active' },
      ], pagination: {} });
    }
    throw new Error('Unexpected Hubstaff route');
  };
  try {
    const response = await availableHubstaffMembers(request('/api/internal/hubstaff-members'));
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    assert.deepEqual(await response.json(), { members: [{ id: '303', name: 'Available Member' }] });
    const allResponse = await availableHubstaffMembers(request('/api/internal/hubstaff-members?aoc_only=false'));
    assert.equal(allResponse.status, 200);
    assert.deepEqual(await allResponse.json(), { members: [
      { id: '303', name: 'Available Member' }, { id: '505', name: 'Outside AOC team' },
    ] });
    assert.equal((await availableHubstaffMembers(request('/api/internal/hubstaff-members?aoc_only=all'))).status, 400);
    const outsider = new Request('https://portal.example/api/internal/internal-users', {
      method: 'POST', headers: { origin: 'https://portal.example', 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Outside Organization', username: 'outside.org',
        password: 'FixturePassword123!', position: 'team_member', hubstaffUserId: '606' }),
    });
    const rejected = await internalUsersPost(outsider);
    assert.equal(rejected.status, 409);
    assert.equal((await rejected.json()).code, 'hubstaff_member_unavailable');
  } finally {
    globalThis.fetch = previousFetch;
    if (previousToken === undefined) delete process.env.HUBSTAFF_ACCESS_TOKEN;
    else process.env.HUBSTAFF_ACCESS_TOKEN = previousToken;
    if (previousTeamId === undefined) delete process.env.HUBSTAFF_INTERNAL_TEAM_ID;
    else process.env.HUBSTAFF_INTERNAL_TEAM_ID = previousTeamId;
    roles = [];
    targetInternalUser = null;
  }
});

test('internal admin sees all current panels and cannot smuggle roles through account payloads', async t => {
  mockTeamRoster(t);
  internalUser = { ...internalUserA, position: 'team_member', panel_access: ['overview'] };
  roles = ['internal_admin'];
  session = { user: { id: 'internal-user-a', name: 'Internal Admin' } };
  const context = await resolveInternalUserContext(headers);
  assert.deepEqual(context.profile.panels,
    ['overview', 'my_tasks', 'activity', 'team_directory', 'account_settings', 'hubstaff',
      ...INTERNAL_HR_PANEL_IDS, ...INTERNAL_PM_PANEL_IDS]);
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=team'))).status, 200);
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'))).status, 200);
  const list = await internalUsersGet(request('/api/internal/internal-users'));
  assert.equal(list.status, 200);
  assert.equal((await list.json()).canManage, true);
  const mutation = (method, body) => new Request('https://portal.example/api/internal/internal-users', {
    method, headers: { origin: 'https://portal.example', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  assert.equal((await internalUsersPost(mutation('POST', { name: 'Incomplete' }))).status, 400);
  assert.equal((await internalUsersPatch(mutation('PATCH', { id: 'invalid' }))).status, 400);
  const rolePost = await internalUsersPost(mutation('POST', { roles: ['internal_admin'] }));
  assert.equal(rolePost.status, 400);
  assert.equal((await rolePost.json()).code, 'role_assignment_terminal_only');
  const rolePatch = await internalUsersPatch(mutation('PATCH', { id: '2', roles: ['internal_admin'] }));
  assert.equal(rolePatch.status, 400);
  assert.equal((await rolePatch.json()).code, 'role_assignment_terminal_only');
  roles = [];
});

test('access managers manage business roles while only internal admin may grant or revoke access managers', async () => {
  internalUser = { ...internalUserA };
  targetInternalUser = { ...internalUserB };
  targetRoles = [];
  roles = ['internal_access_manager'];
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  const put = (id, role, assigned) => new Request('https://portal.example/api/internal/internal-users', {
    method: 'PUT', headers: { origin: 'https://portal.example', 'content-type': 'application/json' },
    body: JSON.stringify({ id, role, assigned }),
  });
  const beforeAudit = roleAudit.length;
  const planned = await internalUsersPut(put('2', 'hr', true));
  assert.equal(planned.status, 200);
  assert.deepEqual((await planned.json()).internalUser.roles, ['hr']);
  assert.equal(roleAudit.length, beforeAudit + 1);
  assert.deepEqual(roleAudit.at(-1), ['1', '2', 'role.grant.hr']);
  assert.equal((await internalUsersPut(put('2', 'internal_admin', true))).status, 400);
  assert.equal((await internalUsersPut(put('2', 'internal_access_manager', true))).status, 403);
  const ownRole = await internalUsersPut(put('1', 'project_management', true));
  assert.equal(ownRole.status, 200);
  assert.equal((await ownRole.json()).internalUser.roles.includes('project_management'), true);
  assert.deepEqual(roleAudit.at(-1), ['1', '1', 'role.grant.project_management']);
  assert.equal((await internalUsersPut(put('1', 'project_management', false))).status, 200);
  assert.deepEqual(roleAudit.at(-1), ['1', '1', 'role.revoke.project_management']);
  const auditedChanges = roleAudit.length;
  assert.equal((await internalUsersPut(put('1', 'internal_access_manager', true))).status, 403);
  assert.equal((await internalUsersPut(put('1', 'internal_access_manager', false))).status, 403);
  assert.equal(roleAudit.length, auditedChanges);
  const injected = new Request('https://portal.example/api/internal/internal-users', {
    method: 'PUT', headers: { origin: 'https://portal.example', 'content-type': 'application/json' },
    body: JSON.stringify({ id: '2', role: 'sales', assigned: true, permissions: ['people.leave.read'] }),
  });
  assert.equal((await internalUsersPut(injected)).status, 400);
  const untrusted = new Request('https://portal.example/api/internal/internal-users', {
    method: 'PUT', headers: { origin: 'https://evil.example', 'content-type': 'application/json' },
    body: JSON.stringify({ id: '2', role: 'sales', assigned: true }),
  });
  assert.equal((await internalUsersPut(untrusted)).status, 403);
  targetRoles = ['internal_access_manager'];
  activeManagerCount = 1;
  assert.equal((await internalUsersPut(put('2', 'internal_access_manager', false))).status, 403);
  activeManagerCount = 2;
  assert.equal((await internalUsersPut(put('2', 'internal_access_manager', false))).status, 403);
  roles = ['internal_admin'];
  assert.equal((await internalUsersPut(put('1', 'sales', true))).status, 403);
  assert.equal((await internalUsersPut(put('1', 'internal_access_manager', true))).status, 403);
  targetRoles = [];
  const adminGrant = await internalUsersPut(put('2', 'internal_access_manager', true));
  assert.equal(adminGrant.status, 200);
  assert.equal((await adminGrant.json()).internalUser.roles.includes('internal_access_manager'), true);
  assert.deepEqual(roleAudit.at(-1), ['1', '2', 'role.grant.internal_access_manager']);
  activeManagerCount = 1;
  assert.equal((await internalUsersPut(put('2', 'internal_access_manager', false))).status, 409);
  activeManagerCount = 2;
  assert.equal((await internalUsersPut(put('2', 'internal_access_manager', false))).status, 200);
  assert.equal((await internalUsersPut(put('2', 'sales', true))).status, 200);
  assert.equal((await internalUsersPut(put('2', 'sales', false))).status, 200);
  targetInternalUser = { ...internalUserB, is_active: false };
  assert.equal((await internalUsersPut(put('2', 'sales', true))).status, 409);
  roles = [];
  targetInternalUser = null;
  targetRoles = [];
});

test('manager can list accounts but cannot update their own managed account', async () => {
  internalUser = { ...internalUserA };
  roles = ['internal_access_manager'];
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  const list = await internalUsersGet(request('/api/internal/internal-users'));
  assert.equal(list.status, 200);
  assert.equal((await list.json()).internalUsers[0].roles[0], 'internal_access_manager');
  const patch = new Request('https://portal.example/api/internal/internal-users', {
    method: 'PATCH', headers: { origin: 'https://portal.example', 'content-type': 'application/json' },
    body: JSON.stringify({ id: '1', name: 'Self', position: 'team_member',
      panelAccess: ['overview'], active: true, hubstaffUserId: '101' }),
  });
  assert.equal((await internalUsersPatch(patch)).status, 403);
  roles = [];
});

test('internal admin can update its own account details but cannot deactivate itself', async () => {
  internalUser = { ...internalUserA };
  roles = ['internal_admin'];
  session = { user: { id: 'internal-user-a', name: 'Internal Admin' } };
  const patch = (overrides = {}) => new Request('https://portal.example/api/internal/internal-users', {
    method: 'PATCH', headers: { origin: 'https://portal.example', 'content-type': 'application/json' },
    body: JSON.stringify({ id: '1', name: 'Updated Admin', position: 'team_member',
      panelAccess: ['overview', 'my_tasks'], active: true, hubstaffUserId: '101', ...overrides }),
  });
  const before = profileUpdates.length;
  const response = await internalUsersPatch(patch());
  assert.equal(response.status, 200);
  assert.equal((await response.json()).internalUser.name, 'Updated Admin');
  assert.equal(profileUpdates.length, before + 1);
  assert.deepEqual(JSON.parse(profileUpdates.at(-1)[1]), ['overview', 'my_tasks']);
  assert.equal((await internalUsersPatch(patch({ active: false }))).status, 409);
  assert.equal(profileUpdates.length, before + 1);
  roles = [];
});

test('overview-only panel receives task summaries, not hidden task details', async () => {
  const user = { ...internalUserA, panel_access: ['overview'] };
  internalUser = { ...user, encrypted_access_token: encryptInternalUserToken(testToken, user,
    process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY) };
  roles = [];
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  globalThis.fetch = hubstaffFixture().fetchImpl;
  const response = await internalUserDashboard(request('/api/internal/dashboard'));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.tasks.length, 1);
  assert.equal(Object.hasOwn(payload.tasks[0], 'description'), false);
  assert.equal(Object.hasOwn(payload.tasks[0], 'href'), false);
  assert.equal(Boolean(payload.workSummary), true);
  assert.equal(integrationRuns.at(-1).source, 'hubstaff');
  assert.equal(integrationRuns.at(-1).operation, 'internal_dashboard');
  assert.equal(integrationRuns.at(-1).status, 'succeeded');
  assert.ok(integrationRuns.at(-1).records_processed > 0);
});

test('audit log is denied to ordinary users and readable by access managers and internal admins', async () => {
  internalUser = { ...internalUserA };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  roles = [];
  assert.equal((await platformAudit(request('/api/internal/audit'))).status, 403);
  roles = ['internal_access_manager'];
  const managerResponse = await platformAudit(request('/api/internal/audit'));
  assert.equal(managerResponse.status, 200);
  assert.equal(managerResponse.headers.get('cache-control'), 'private, no-store');
  assert.deepEqual(roleAudit.at(-1), ['1', 'audit_log.read']);
  roles = ['internal_admin'];
  const response = await platformAudit(request('/api/internal/audit'));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal((await response.json()).integrationRuns[0].source, 'hubstaff');
  roles = [];
});

test('audit log paginates each table independently and can reach older dates', async t => {
  internalUser = { ...internalUserA };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  roles = ['internal_access_manager'];
  t.after(() => { pagedAuditRuns = null; pagedAuditEvents = null; roles = []; });
  pagedAuditRuns = Array.from({ length: 45 }, (_, index) => ({
    id: 45 - index, source: 'hubstaff', started_at: new Date(Date.UTC(2026, 8, 45 - index)),
  }));
  pagedAuditEvents = Array.from({ length: 45 }, (_, index) => ({
    id: 45 - index, action: 'panel.read.team', occurred_at: new Date(Date.UTC(2026, 8, 45 - index)),
  }));

  const first = await (await platformAudit(request('/api/internal/audit'))).json();
  assert.equal(first.integrationRuns.length, 20);
  assert.equal(first.accessEvents.length, 20);
  assert.equal(first.integrationRuns[0].id, 45);
  assert.equal(first.pagination.runsHasMore, true);
  assert.equal(first.pagination.activityHasMore, true);

  const query = new URLSearchParams({ asOf: first.pagination.asOf, runsPage: '2', activityPage: '3' });
  const older = await (await platformAudit(request(`/api/internal/audit?${query}`))).json();
  assert.equal(older.pagination.asOf, first.pagination.asOf);
  assert.equal(older.integrationRuns[0].id, 25);
  assert.equal(older.accessEvents[0].id, 5);
  assert.equal(older.accessEvents.length, 5);
  assert.equal(older.pagination.runsHasMore, true);
  assert.equal(older.pagination.activityHasMore, false);

  const invalid = await (await platformAudit(request('/api/internal/audit?runsPage=-1&activityPage=999999999'))).json();
  assert.equal(invalid.pagination.runsPage, 1);
  assert.equal(invalid.pagination.activityPage, 1);
});

test('failed Hubstaff loads record a safe error code without provider details', async () => {
  const user = { ...internalUserA, panel_access: ['overview'] };
  internalUser = { ...user, encrypted_access_token: encryptInternalUserToken(testToken, user,
    process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY) };
  roles = [];
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  globalThis.fetch = async () => { throw new Error('secret=must-never-be-logged'); };
  const response = await internalUserDashboard(request('/api/internal/dashboard'));
  assert.ok(response.status >= 400);
  const run = integrationRuns.at(-1);
  assert.equal(run.status, 'failed');
  assert.equal(run.error_code, 'hubstaff_unavailable');
  assert.equal(JSON.stringify(run).includes('must-never-be-logged'), false);
  globalThis.fetch = originalFetch;
});

test('an internal user without the Hubstaff panel cannot submit a connection token directly', async () => {
  internalUser = { ...internalUserA, panel_access: ['overview'] };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  const response = await connect(request('/api/internal/connection', 'POST', new URLSearchParams({ token: testToken })));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/internal/settings?connection=panel_forbidden');
});

test('connection POST validates identity, stores ciphertext only, rejects origin/body injection and rate-limits', async () => {
  internalUser = { ...internalUserA };
  const fixture = hubstaffFixture();
  globalThis.fetch = (url, options) => String(url) === 'https://account.hubstaff.com/access_tokens'
    ? Promise.resolve(Response.json({ access_token: 'fixture-exchanged-access-never-real',
      refresh_token: 'fixture-rotated-refresh-never-real', expires_in: 86400 }))
    : fixture.fetchImpl(url, options);
  let response = await connect(request('/api/internal/connection', 'POST', new URLSearchParams({ token: testToken })));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/internal/settings?connection=connected');
  assert.equal(savedCiphertext.startsWith('v1.'), true);
  assert.equal(savedCiphertext.includes(testToken), false);
  assert.equal((await response.text()).includes(testToken), false);
  const calls = fixture.calls.length;
  response = await connect(new Request('https://portal.example/api/internal/connection', { method: 'POST', headers: { origin: 'https://evil.example' } }));
  assert.equal(response.status, 403);
  response = await connect(request('/api/internal/connection', 'POST', new URLSearchParams({ token: testToken, hubstaff_user_id: '202' })));
  assert.equal(response.headers.get('location'), '/internal/settings?connection=invalid_request');
  assert.equal(fixture.calls.length, calls);
  claimed = false;
  response = await connect(request('/api/internal/connection', 'POST', new URLSearchParams({ token: testToken })));
  assert.equal(response.headers.get('location'), '/internal/settings?connection=refresh_limited');
  assert.equal(fixture.calls.length, calls);
  claimed = true;
  const otherUser = hubstaffFixture({ userId: 202 });
  globalThis.fetch = (url, options) => String(url) === 'https://account.hubstaff.com/access_tokens'
    ? Promise.resolve(Response.json({ access_token: 'fixture-exchanged-access-never-real',
      refresh_token: 'fixture-rotated-refresh-never-real', expires_in: 86400 }))
    : otherUser.fetchImpl(url, options);
  const saved = savedCiphertext;
  response = await connect(request('/api/internal/connection', 'POST', new URLSearchParams({ token: testToken })));
  assert.equal(response.headers.get('location'), '/internal/settings?connection=identity_mismatch');
  assert.equal(savedCiphertext, saved, 'A failed connection never overwrites the working one');
});

test('Hubstaff unlink clears only the signed-in user connection, audits once, and rejects denied requests', async () => {
  roles = [];
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  const connected = { ...internalUserA, encrypted_access_token: 'fixture-encrypted-access-never-real',
    encrypted_refresh_token: 'fixture-encrypted-refresh-never-real',
    access_expires_at: new Date('2026-12-01'), hubstaff_connection_kind: 'oauth',
    last_synced_at: new Date('2026-10-01') };
  internalUser = { ...connected, panel_access: ['overview'] };
  let response = await unlink(request('/api/internal/connection/unlink', 'POST'));
  assert.equal(response.headers.get('location'), '/internal/settings?connection=panel_forbidden');
  assert.equal(internalUser.encrypted_access_token, connected.encrypted_access_token);

  internalUser = { ...connected };
  response = await unlink(new Request('https://portal.example/api/internal/connection/unlink', {
    method: 'POST', headers: { origin: 'https://evil.example' },
  }));
  assert.equal(response.status, 403);
  assert.equal(internalUser.encrypted_access_token, connected.encrypted_access_token);
  response = await unlink(request('/api/internal/connection/unlink?user_id=2', 'POST'));
  assert.equal(response.headers.get('location'), '/internal/settings?connection=invalid_request');
  assert.equal(internalUser.encrypted_access_token, connected.encrypted_access_token);

  const beforeAudit = roleAudit.length;
  const beforeRuns = integrationRuns.length;
  response = await unlink(request('/api/internal/connection/unlink', 'POST'));
  assert.equal(response.status, 303);
  assert.equal(response.headers.get('location'), '/internal/settings?connection=unlinked');
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(internalUser.encrypted_access_token, null);
  assert.equal(internalUser.encrypted_refresh_token, null);
  assert.equal(internalUser.access_expires_at, null);
  assert.equal(internalUser.last_synced_at, null);
  assert.equal(internalUser.hubstaff_connection_kind, 'pat');
  assert.equal(internalUser.connection_version, '1');
  assert.equal(internalUser.hubstaff_user_id, connected.hubstaff_user_id);
  assert.deepEqual(roleAudit.slice(beforeAudit), [['1', '1', 'hubstaff.connection.unlink']]);
  assert.equal(integrationRuns.length, beforeRuns, 'No provider request or integration run is needed');

  response = await unlink(request('/api/internal/connection/unlink', 'POST'));
  assert.equal(response.headers.get('location'), '/internal/settings?connection=connection_changed');
  assert.equal(roleAudit.length, beforeAudit + 1);
  await assert.rejects(unlinkInternalUserConnection(db, connected), error =>
    error.publicDetails?.code === 'connection_changed');
});
