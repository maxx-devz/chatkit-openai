// Explicitly opt-in development smoke test. Creates uniquely named fixture accounts,
// exercises real login/HTTP guards, then removes ONLY the records it created.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import pg from 'pg';
import { createPortalAuth, closeAuthDatabase } from '../lib/auth.js';

const origin = process.env.BETTER_AUTH_URL;
if (!process.argv.includes('--development-fixtures') || origin !== 'http://127.0.0.1:3000') {
  console.error('Run only against the confirmed development database and local server with --development-fixtures.');
  process.exit(1);
}
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
const created = [];
let clientId;
let clientSlug;
let step = 'connect';
let baseline;
async function snapshot() {
  const hashes = [];
  for (const table of ['portal_clients', 'portal_memberships', 'portal_admins', 'portal_chatkit_threads', 'portal_chatkit_items']) {
    const result = await db.query(`SELECT row_to_json(t)::text AS value FROM ${table} t ORDER BY row_to_json(t)::text`);
    hashes.push(createHash('sha256').update(JSON.stringify(result.rows)).digest('hex'));
  }
  return hashes;
}
async function call(path, account, method = 'GET', body, extraHeaders = {}) {
  return fetch(`${origin}${path}`, { method, redirect: 'manual',
    headers: { origin, cookie: account.cookie, ...extraHeaders, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(60000) });
}
try {
  await db.connect();
  baseline = await snapshot();
  const provisioning = createPortalAuth({ allowAccountCreation: true, useNextCookies: false });
  const tag = randomBytes(6).toString('hex');
  for (const role of ['client', 'admin', 'internal-user-a', 'internal-user-b']) {
    step = `provision ${role}`;
    const username = `smoke-${tag}-${role}`;
    const password = randomBytes(24).toString('base64url');
    const email = `${username}@example.invalid`;
    const result = await provisioning.api.signUpEmail({ body: { username, password, email, name: `Smoke ${role}` } });
    assert.ok(result.user.id);
    const account = { role, username, id: result.user.id, cookie: '' };
    created.push(account);
    const user = await db.query('INSERT INTO portal_users(external_id,email,display_name) VALUES($1,$2,$3) RETURNING id', [account.id, email, `Smoke ${role}`]);
    account.portalId = user.rows[0].id;
    if (role === 'client') {
      clientSlug = username;
      const client = await db.query('INSERT INTO portal_clients(slug,display_name) VALUES($1,$2) RETURNING id', [clientSlug, 'Smoke client']);
      clientId = client.rows[0].id;
      await db.query("INSERT INTO portal_memberships(user_id,client_id,role) VALUES($1,$2,'client_admin')", [account.portalId, clientId]);
    } else if (role === 'admin') {
      await db.query("INSERT INTO portal_admins(user_id,role) VALUES($1,'aoc_admin')", [account.portalId]);
    } else {
      const fixtureHubstaffId = Number.parseInt(randomBytes(6).toString('hex'), 16);
      await db.query('INSERT INTO portal_internal_users(user_id,hubstaff_user_id) VALUES($1,$2)', [account.portalId, fixtureHubstaffId]);
    }
    step = `login ${role}`;
    const login = await fetch(`${origin}/api/auth/sign-in/username`, { method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), signal: AbortSignal.timeout(60000) });
    assert.equal(login.status, 200);
    account.cookie = login.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    assert.ok(account.cookie);
    await login.body?.cancel();
  }
  const [client, admin, a, b] = created;
  step = 'client page and Hubstaff regression';
  assert.equal((await call('/', client)).status, 200);
  const workspace = await call('/api/workspace', client);
  assert.equal(workspace.status, 200);
  assert.equal((await workspace.json()).client.slug, clientSlug);
  const hubstaff = await call('/api/hubstaff', client);
  assert.equal(hubstaff.status, 200);
  assert.equal((await hubstaff.json()).configured, false);
  step = 'client ChatKit history through the signed Python proxy';
  const chat = await call('/api/chatkit', client, 'POST', { type: 'threads.list', params: { limit: 10, order: 'desc' } }, { 'x-aoc-client': String(clientId) });
  assert.equal(chat.status, 200);
  await chat.body?.cancel();
  step = 'admin page and API regression';
  assert.equal((await call('/admin', admin)).status, 200);
  assert.equal((await call('/api/admin/clients', admin)).status, 200);
  assert.equal((await call('/builder', admin)).status, 200);
  for (const account of [client, admin]) assert.equal((await call('/api/internal/dashboard', account)).status, 403);
  for (const internalUser of [a, b]) {
    step = `${internalUser.role} page and routing`;
    const root = await call('/', internalUser);
    assert.equal(root.status, 307);
    assert.equal(root.headers.get('location'), '/internal');
    const page = await call('/internal', internalUser);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /My Assigned Tasks/);
    const own = await call('/api/internal/dashboard', internalUser);
    assert.equal(own.status, 200);
    assert.deepEqual((await own.json()).tasks, []);
    step = `${internalUser.role} restricted pages and APIs`;
    assert.match(await (await call('/admin', internalUser)).text(), /Administrator access required/);
    assert.match(await (await call('/builder', internalUser)).text(), /Builder unavailable/);
    for (const path of ['/api/admin/clients', '/api/admin/presence', '/api/admin/ai-usage', '/api/builder', '/api/workspace',
      '/api/ai-access', '/api/conversations', '/api/client-library', '/api/hubstaff', '/api/hubstaff/tasks', '/api/hubstaff/workflow']) {
      step = `${internalUser.role} denied ${path}`;
      assert.equal((await call(path, internalUser)).status, 403);
    }
    assert.equal((await call('/api/chatkit', internalUser, 'POST', {})).status, 403);
    assert.equal((await call('/api/session/client', internalUser, 'PUT', { slug: clientSlug })).status, 403);
    assert.equal((await call('/api/builder', internalUser, 'POST', {})).status, 403);
    for (const key of ['internal_user_id', 'hubstaff_user_id', 'client_id', 'project_id']) {
      assert.equal((await call(`/api/internal/dashboard?${key}=${b.portalId}`, internalUser)).status, 400);
    }
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) assert.equal((await call('/api/internal/dashboard', internalUser, method)).status, 405);
  }
  step = 'inactive internal user';
  await db.query('UPDATE portal_internal_users SET is_active=FALSE WHERE user_id=$1', [a.portalId]);
  assert.equal((await call('/api/internal/dashboard', a)).status, 403);
  assert.match(await (await call('/internal', a)).text(), /Internal user access unavailable/);
  console.log('Authenticated HTTP passed: real client/admin/internal logins, internal user routing, restricted pages/APIs, ID manipulation, GET-only dashboard, client Hubstaff, and signed ChatKit history. No model calls.');
} catch {
  console.error(`Internal user HTTP check failed during: ${step}. Sensitive response bodies were not printed.`);
  process.exitCode = 1;
} finally {
  try {
    // Validate each exact target against the unique account created in this run.
    for (const account of created) {
      const check = await db.query('SELECT id FROM "user" WHERE id=$1 AND username=$2', [account.id, account.username]);
      assert.equal(check.rowCount, 1);
      await db.query('DELETE FROM portal_users WHERE external_id=$1', [account.id]);
      await db.query('DELETE FROM "user" WHERE id=$1 AND username=$2', [account.id, account.username]);
    }
    if (clientId) await db.query('DELETE FROM portal_clients WHERE id=$1 AND slug=$2', [clientId, clientSlug]);
    if (baseline) assert.deepEqual(await snapshot(), baseline);
    console.log('Removed only this run’s fixture accounts/workspace; existing client, admin, membership and ChatKit records match their pre-test snapshots.');
  } catch {
    console.error('Fixture cleanup or preservation check failed. Review development records with the smoke- prefix before rerunning.');
    process.exitCode = 1;
  }
  await db.end().catch(() => {});
  await closeAuthDatabase().catch(() => {});
}
