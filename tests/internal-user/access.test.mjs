import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { internalUserA, internalUserB, hubstaffFixture, testToken } from './fixtures.mjs';

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
const profileUpdates = [];
const db = { query: async (query, values) => {
  if (['BEGIN', 'COMMIT', 'ROLLBACK', 'LOCK TABLE portal_internal_user_roles IN SHARE ROW EXCLUSIVE MODE'].includes(query)) {
    return { rows: [] };
  }
  if (query.includes("r.role_key IN ('internal_access_manager','internal_admin')")) {
    return { rows: roles.some(role => ['internal_access_manager', 'internal_admin'].includes(role)) ? [{ one: 1 }] : [] };
  }
  if (query.startsWith('SELECT is_active FROM portal_internal_users WHERE user_id=')) {
    return { rows: targetInternalUser ? [{ is_active: targetInternalUser.is_active }] : [] };
  }
  if (query.includes('SELECT COUNT(*)::int AS count FROM portal_internal_user_roles')) {
    return { rows: [{ count: activeManagerCount }] };
  }
  if (query.startsWith('DELETE FROM portal_internal_user_roles')) {
    const role = values[1] || 'internal_access_manager';
    const assigned = targetRoles.includes(role);
    targetRoles = targetRoles.filter(candidate => candidate !== role);
    return { rowCount: Number(assigned), rows: assigned ? [{ user_id: values[0] }] : [] };
  }
  if (query.startsWith('INSERT INTO portal_internal_user_roles')) {
    const assigned = targetRoles.includes(values[1]);
    if (!assigned) targetRoles = [...targetRoles, values[1]];
    return { rowCount: Number(!assigned), rows: assigned ? [] : [{ user_id: values[0] }] };
  }
  if (query.startsWith('INSERT INTO portal_internal_access_audit')) {
    roleAudit.push(values);
    return { rowCount: 1, rows: [] };
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
const { encryptInternalUserToken } = await import('../../lib/internal-user-repository.js');
const { GET: internalUserDashboard } = await import('../../app/api/internal/dashboard/route.js');
const { GET: internalUsersGet, POST: internalUsersPost, PATCH: internalUsersPatch, PUT: internalUsersPut,
} = await import('../../app/api/internal/internal-users/route.js');
const { POST: connect } = await import('../../app/api/internal/connection/route.js');
const { POST: chatkit } = await import('../../app/api/chatkit/route.js');
const { GET: clientHubstaff } = await import('../../app/api/hubstaff/route.js');
const { GET: builder } = await import('../../app/api/builder/route.js');
const headers = new Headers({ origin: 'https://portal.example' });
const request = (path, method = 'GET', body) => new Request(`https://portal.example${path}`, {
  method, headers: { origin: 'https://portal.example', ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}) }, body,
});

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

test('active internal user endpoint returns no legacy state and refuses every browser-selected identity', async () => {
  internalUser = { ...internalUserA };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  const context = await resolveInternalUserContext(headers);
  assert.equal(context.profile.name, internalUserA.display_name);
  assert.equal(context.profile.position, 'Team Member');
  assert.deepEqual(context.profile.panels, ['overview', 'my_tasks', 'activity', 'team_directory', 'hubstaff']);
  const response = await internalUserDashboard(request('/api/internal/dashboard'));
  assert.deepEqual((await response.json()).tasks, []);
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  const teamResponse = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
  assert.equal(teamResponse.status, 200);
  assert.deepEqual(Object.keys((await teamResponse.json()).teamMembers[0]).sort(), ['id', 'name', 'position']);
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'))).status, 200);
  for (const key of ['internal_user_id', 'hubstaff_user_id', 'project_id', 'client_id']) {
    assert.equal((await internalUserDashboard(request(`/api/internal/dashboard?${key}=2`))).status, 400);
  }
});

test('project manager still sees only the basic Team directory', async () => {
  internalUser = { ...internalUserA, position: 'project_manager', panel_access: undefined };
  roles = ['project_management'];
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  const response = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.access.position, 'Project Manager');
  assert.equal(payload.access.panels.includes('team_directory'), true);
  assert.equal(payload.teamMembers.length, 1);
  assert.deepEqual(Object.keys(payload.teamMembers[0]).sort(), ['id', 'name', 'position']);
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

test('Team defaults from position when panel access is unset, but an explicit omission denies access', async () => {
  internalUser = { ...internalUserA, position: 'project_manager', panel_access: undefined };
  roles = [];
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  const teamResponse = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
  assert.equal(teamResponse.status, 200);
  assert.deepEqual(Object.keys((await teamResponse.json()).teamMembers[0]).sort(), ['id', 'name', 'position']);
  internalUser = { ...internalUserA, panel_access: ['overview'] };
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=team'))).status, 403);
  assert.equal((await resolveInternalUserContext(headers)).profile.panels.includes('team_directory'), false);
});

test('Team never exposes other users connection status, including to account managers', async () => {
  internalUser = { ...internalUserA, panel_access: ['overview', 'team_directory'] };
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  for (const assignedRoles of [[], ['project_management'], ['hr'], ['internal_access_manager'], ['internal_admin']]) {
    roles = assignedRoles;
    const response = await internalUserDashboard(request('/api/internal/dashboard?workspace=team'));
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.deepEqual(Object.keys(payload.teamMembers[0]).sort(), ['id', 'name', 'position']);
    assert.equal(Object.hasOwn(payload.access, 'teamTasksAvailable'), false);
  }
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

test('Hubstaff settings need its panel; a planned role cannot open Internal Settings', async () => {
  session = { user: { id: 'internal-user-a', name: 'InternalUser A' } };
  internalUser = { ...internalUserA, panel_access: ['overview'] };
  roles = ['sales'];
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'))).status, 403);
  assert.equal((await internalUsersGet(request('/api/internal/internal-users'))).status, 403);
  roles = [];
  internalUser = { ...internalUserA, panel_access: ['hubstaff'] };
  assert.equal((await internalUserDashboard(request('/api/internal/dashboard?workspace=settings'))).status, 200);
});

test('non-manager cannot read or create internal user accounts through the new API', async () => {
  internalUser = { ...internalUserA };
  roles = ['project_management'];
  session = { user: { id: 'internal-user-a', name: 'Manager' } };
  assert.equal((await internalUsersGet(request('/api/internal/internal-users'))).status, 403);
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

test('internal admin sees all current panels and cannot smuggle roles through account payloads', async () => {
  internalUser = { ...internalUserA, position: 'team_member', panel_access: ['overview'] };
  roles = ['internal_admin'];
  session = { user: { id: 'internal-user-a', name: 'Internal Admin' } };
  const context = await resolveInternalUserContext(headers);
  assert.deepEqual(context.profile.panels,
    ['overview', 'my_tasks', 'activity', 'team_directory', 'hubstaff']);
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

test('access managers can assign implemented and planned roles but never the protected role or their own', async () => {
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
  assert.equal((await internalUsersPut(put('1', 'project_management', true))).status, 403);
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
  const manager = await internalUsersPut(put('2', 'internal_access_manager', true));
  assert.equal(manager.status, 200);
  assert.equal((await manager.json()).internalUser.roles.includes('internal_access_manager'), true);
  activeManagerCount = 1;
  assert.equal((await internalUsersPut(put('2', 'internal_access_manager', false))).status, 409);
  activeManagerCount = 2;
  assert.equal((await internalUsersPut(put('2', 'internal_access_manager', false))).status, 200);
  roles = ['internal_admin'];
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
