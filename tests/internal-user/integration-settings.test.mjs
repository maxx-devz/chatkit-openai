import assert from 'node:assert/strict';
import { after, mock, test } from 'node:test';

let session = { user: { id: 'fixture-portal-user' } };
let roles = ['internal_access_manager'];
let auditReady = true;
let providerStatus = 200;
const runs = [];
const actions = [];
const actor = { user_id: '7', account_type: 'internal_user', is_active: true,
  position: 'team_member', panel_access: ['overview'], display_name: 'Fixture Manager' };
const db = { async query(sql, values = []) {
  if (sql.includes("to_regclass('portal_internal_users')")) return { rows: [{ relation: 'portal_internal_users' }] };
  if (sql.includes('SELECT e.*, u.display_name')) return { rows: [actor] };
  if (sql.includes("to_regclass('portal_internal_user_roles')")) return { rows: [{ relation: 'portal_internal_user_roles' }] };
  if (sql.includes('SELECT role_key FROM portal_internal_user_roles')) {
    return { rows: roles.map(role_key => ({ role_key })) };
  }
  if (sql.includes("to_regclass('portal_integration_runs')")) {
    return { rows: [{ runs: auditReady ? 'portal_integration_runs' : null }] };
  }
  if (sql.includes("WHERE source='hubstaff' AND operation='connection_test'")) {
    return { rows: runs.filter(run => run.status !== 'running' && run.environment === values[0])
      .slice(-1).map(run => ({ status: run.status, error_code: run.error_code,
        finished_at: run.finished_at })) };
  }
  if (sql.startsWith('INSERT INTO portal_internal_access_audit')) {
    actions.push(values[1]);
    return { rowCount: 1, rows: [] };
  }
  if (sql.startsWith('INSERT INTO portal_integration_runs')) {
    const id = runs.length + 1;
    runs.push({ id, source: values[0], operation: values[1], actor: values[2],
      environment: values[3], trigger: values[4], status: 'running' });
    return { rows: [{ id }] };
  }
  if (sql.startsWith('UPDATE portal_integration_runs')) {
    const run = runs.find(item => item.id === values[0]);
    run.status = values[1];
    run.error_code = values[5];
    run.finished_at = new Date();
    return { rowCount: 1 };
  }
  throw new Error(`Unexpected SQL: ${sql.slice(0, 80)}`);
} };

mock.module('../../lib/auth.js', { namedExports: {
  auth: { api: { getSession: async () => session } },
  isPortalAuthConfigured: () => true,
} });
mock.module('pg', { defaultExport: { Pool: class { query(...args) { return db.query(...args); } } } });
process.env.DATABASE_URL = 'postgresql://fixture.invalid/unused';
process.env.BETTER_AUTH_URL = 'https://portal.example';
process.env.HUBSTAFF_ACCESS_TOKEN = 'hsoat_fixture_secret_do_not_return';
process.env.HUBSTAFF_INTERNAL_TEAM_ID = '25';
process.env.HUBSTAFF_TEAM_SCHEDULES_VERIFIED = 'true';
const originalFetch = globalThis.fetch;
globalThis.fetch = async url => {
  if (providerStatus !== 200) return Response.json({ error: 'fixture secret' }, { status: providerStatus });
  const path = new URL(url).pathname;
  if (path === '/v2/organizations') return Response.json({ organizations: [{ id: 9 }] });
  if (path === '/v2/organizations/9/teams') return Response.json({ teams: [{ id: 25 }] });
  if (path === '/v2/teams/25/members') return Response.json({ team_members: [{ user_id: 101 }] });
  if (path === '/v2/organizations/9/members') return Response.json({
    members: [{ user_id: 101, membership_status: 'active' }],
    users: [{ id: 101, name: 'Private Member Name', status: 'active' }],
  });
  throw new Error(`Unexpected provider URL: ${path}`);
};
after(() => { globalThis.fetch = originalFetch; });

const { GET, POST } = await import('../../app/api/internal/integration-settings/route.js');
const { hubstaffIntegrationConfiguration } = await import('../../lib/internal-integration-settings.js');
const request = (method = 'GET', origin = 'https://portal.example') => new Request(
  'https://portal.example/api/internal/integration-settings', { method, headers: { origin } });

test('configuration overview reveals only safe flags and planned connector names', async () => {
  assert.deepEqual(hubstaffIntegrationConfiguration({ HUBSTAFF_ACCESS_TOKEN: 'wrong',
    HUBSTAFF_INTERNAL_TEAM_ID: 'bad' }), {
    tokenConfigured: false, teamConfigured: false, teamId: null,
    schedulesVerified: false, status: 'setup_needed',
  });
  const response = await GET(request());
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.canTest, false);
  assert.equal(body.hubstaff.status, 'ready_to_test');
  assert.equal(body.hubstaff.teamId, '25');
  assert.deepEqual(body.planned.map(item => item.label), ['HubSpot', 'Help Scout', 'Google Drive', 'Make']);
  assert.doesNotMatch(JSON.stringify(body), /hsoat_|Private Member Name/);
  assert.ok(actions.includes('integration_settings.read'));
});

test('direct API access requires an active management role and trusted test origin', async () => {
  session = null;
  assert.equal((await GET(request())).status, 401);
  session = { user: { id: 'fixture-portal-user' } };
  roles = [];
  assert.equal((await GET(request())).status, 403);
  roles = ['internal_access_manager'];
  assert.equal((await POST(request('POST'))).status, 403);
  roles = ['internal_admin'];
  assert.equal((await POST(request('POST', 'https://other.example'))).status, 403);
  assert.equal(runs.length, 0);
});

test('admin connection test is read-only, audited, and never returns member names', async () => {
  roles = ['internal_admin'];
  const response = await POST(request('POST'));
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.hubstaff.lastTest.status, 'succeeded');
  assert.equal(body.canTest, true);
  assert.equal(runs[0].operation, 'connection_test');
  assert.equal(runs[0].trigger, 'manual');
  assert.equal(runs[0].actor, '7');
  assert.doesNotMatch(JSON.stringify(body), /hsoat_|Private Member Name/);
});

test('failed connection test stores a safe code and missing audit schema blocks provider reads', async () => {
  providerStatus = 401;
  const failed = await POST(request('POST'));
  assert.equal(failed.status, 503);
  assert.doesNotMatch(JSON.stringify(await failed.json()), /fixture secret|hsoat_/);
  assert.equal(runs.at(-1).status, 'failed');
  assert.equal(runs.at(-1).error_code, 'hubstaff_directory_unavailable');
  const overview = await GET(request());
  assert.equal((await overview.json()).hubstaff.lastTest.status, 'failed');
  auditReady = false;
  const count = runs.length;
  assert.equal((await POST(request('POST'))).status, 503);
  assert.equal(runs.length, count);
});
