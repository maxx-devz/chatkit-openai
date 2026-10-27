import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

let session = { user: { id: 'auth-manager', username: 'fixture.manager', name: 'Fixture Manager' } };
let roles = ['internal_access_manager'];
let targetRoles = [];
let currentPasswordValid = true;
let changeResponse = Response.json({ user: { id: 'auth-manager' } }, {
  headers: { 'Set-Cookie': 'better-auth.session_token=rotated; Path=/; HttpOnly' },
});
const writes = [];
let changedPasswordBody;
let verifiedPassword;
let accountSettingsEnabled = true;
const actor = { user_id: '1', account_type: 'internal_user', is_active: true,
  position: 'team_member', panel_access: ['overview', 'account_settings'], display_name: 'Fixture Manager' };

const db = { async query(sql, values = []) {
  if (sql.startsWith("SELECT to_regclass('portal_internal_users')")) return { rows: [{ relation: 'portal_internal_users' }] };
  if (sql.startsWith("SELECT to_regclass('portal_internal_user_roles')")) return { rows: [{ relation: 'portal_internal_user_roles' }] };
  if (sql.startsWith('SELECT e.*, u.display_name')) return { rows: session ? [{ ...actor,
    panel_access: accountSettingsEnabled ? ['overview', 'account_settings'] : ['overview'] }] : [] };
  if (sql.startsWith('SELECT role_key FROM portal_internal_user_roles WHERE user_id=')) {
    return { rows: (values[0] === '1' ? roles : targetRoles).map(role_key => ({ role_key })) };
  }
  if (sql === 'BEGIN' || sql === 'COMMIT' || sql === 'ROLLBACK' || sql.startsWith('LOCK TABLE')) {
    writes.push(sql);
    return { rows: [] };
  }
  if (sql.startsWith('SELECT e.is_active,')) return { rows: [{ is_active: true,
    is_admin: roles.includes('internal_admin'), is_manager: roles.includes('internal_access_manager') }] };
  if (sql.startsWith('SELECT e.user_id, auth_user.id AS auth_user_id')) return { rows: [{
    user_id: '2', auth_user_id: 'auth-target', username: 'fixture.target',
  }] };
  if (sql.startsWith('UPDATE "account"')) { writes.push(['password', values]); return { rowCount: 1 }; }
  if (sql.startsWith('DELETE FROM "session"')) { writes.push(['sessions', values]); return { rowCount: 2 }; }
  if (sql.startsWith('INSERT INTO portal_internal_access_audit')) { writes.push(['audit', values]); return { rowCount: 1 }; }
  throw new Error(`Unexpected SQL: ${sql.slice(0, 60)}`);
} };

mock.module('../../lib/auth.js', { namedExports: {
  auth: { api: {
    getSession: async () => session,
    verifyPassword: async ({ body }) => {
      verifiedPassword = body.password;
      if (!currentPasswordValid) throw Object.assign(new Error('invalid'), { status: 400 });
      return { status: true };
    },
    changePassword: async ({ body }) => { changedPasswordBody = body; return changeResponse; },
  }, $context: Promise.resolve({ password: { hash: async () => 'fixture-hash' } }) },
  isPortalAuthConfigured: () => true,
} });
mock.module('pg', { defaultExport: { Pool: class {
  query(...args) { return db.query(...args); }
  async connect() { return { query: (...args) => db.query(...args), release() {} }; }
} } });
process.env.DATABASE_URL = 'postgresql://fixture.invalid/unused';
process.env.BETTER_AUTH_URL = 'https://portal.example';

const { POST, PUT } = await import('../../app/api/internal/password/route.js');
const request = (method, body, origin = 'https://portal.example') => new Request('https://portal.example/api/internal/password', {
  method, headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
const validNew = 'FixtureReset123!';

test('only authenticated internal users may change their own password', async () => {
  session = null;
  assert.equal((await POST(request('POST', { currentPassword: 'old', newPassword: validNew }))).status, 401);
  session = { user: { id: 'auth-manager', username: 'fixture.manager', name: 'Fixture Manager' } };
  assert.equal((await POST(request('POST', { currentPassword: 'old', newPassword: validNew }, 'https://evil.example'))).status, 403);
  const weak = await POST(request('POST', { currentPassword: 'old', newPassword: 'onlylowercaseletters' }));
  assert.equal(weak.status, 400);
  assert.equal((await weak.json()).code, 'invalid_new_password');
});

test('self-service password change verifies the old password and rotates other sessions', async () => {
  changedPasswordBody = null;
  const response = await POST(request('POST', { currentPassword: 'FixtureOld123!', newPassword: validNew }));
  assert.equal(response.status, 200);
  assert.deepEqual(changedPasswordBody, { currentPassword: 'FixtureOld123!', newPassword: validNew,
    revokeOtherSessions: true });
  assert.equal(response.headers.getSetCookie().length, 1);
  assert.deepEqual(await response.json(), { changed: true });
  changeResponse = Response.json({ code: 'INVALID_PASSWORD' }, { status: 400 });
  const wrong = await POST(request('POST', { currentPassword: 'wrong', newPassword: validNew }));
  assert.equal((await wrong.json()).code, 'invalid_current_password');
});

test('a disabled Account Settings panel blocks password change at the API', async () => {
  accountSettingsEnabled = false;
  changedPasswordBody = null;
  const response = await POST(request('POST', { currentPassword: 'FixtureOld123!', newPassword: validNew }));
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'panel_forbidden');
  assert.equal(changedPasswordBody, null);
  accountSettingsEnabled = true;
});

test('manager reset requires permission, another target, and current-password reauthentication', async () => {
  writes.length = 0;
  roles = [];
  assert.equal((await PUT(request('PUT', { id: '2', currentPassword: 'FixtureOld123!', newPassword: validNew }))).status, 403);
  assert.equal(writes.length, 0);
  roles = ['internal_access_manager'];
  assert.equal((await PUT(request('PUT', { id: '1', currentPassword: 'FixtureOld123!', newPassword: validNew }))).status, 403);
  currentPasswordValid = false;
  assert.equal((await PUT(request('PUT', { id: '2', currentPassword: 'wrong', newPassword: validNew }))).status, 400);
  assert.equal(writes.length, 0);
  currentPasswordValid = true;
});

test('Access Managers cannot reset protected accounts, and invalid passwords never reach storage', async () => {
  writes.length = 0;
  targetRoles = ['internal_access_manager'];
  const protectedResult = await PUT(request('PUT', { id: '2', currentPassword: 'FixtureOld123!', newPassword: validNew }));
  assert.equal((await protectedResult.json()).code, 'protected_account');
  assert.equal(writes.some(item => Array.isArray(item) && item[0] === 'password'), false);
  targetRoles = [];
  writes.length = 0;
  const weak = await PUT(request('PUT', { id: '2', currentPassword: 'FixtureOld123!', newPassword: 'onlylowercaseletters' }));
  assert.equal((await weak.json()).code, 'invalid_new_password');
  assert.equal(writes.some(item => Array.isArray(item) && item[0] === 'password'), false);
});

test('approved reset changes only the target credential and revokes sessions with an audit event', async () => {
  writes.length = 0;
  const response = await PUT(request('PUT', { id: '2', currentPassword: 'FixtureOld123!', newPassword: validNew }));
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { reset: true });
  assert.equal(verifiedPassword, 'FixtureOld123!');
  assert.deepEqual(writes.filter(Array.isArray), [
    ['password', ['fixture-hash', 'auth-target']],
    ['sessions', ['auth-target']],
    ['audit', ['1', '2']],
  ]);
  assert.equal(writes.at(-1), 'COMMIT');
  writes.length = 0;
  targetRoles = ['internal_admin'];
  roles = ['internal_admin'];
  assert.equal((await PUT(request('PUT', { id: '2', currentPassword: 'FixtureOld123!', newPassword: validNew }))).status, 200);
});
