import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import pg from "pg";

test("Stage 12 synthetic platform console", { skip: !process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL }, async t => {
  const operator = new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL), runtime = new URL(process.env.DATABASE_URL), origin = process.env.BETTER_AUTH_URL;
  assert.equal(operator.hostname, "127.0.0.1"); assert.match(operator.pathname, /^\/aoc_stage04_rehearsal_[a-f0-9]+$/);
  assert.equal(operator.host, runtime.host); assert.equal(operator.pathname, runtime.pathname); assert.notEqual(operator.username, runtime.username);
  assert.equal(new URL(origin).hostname, "127.0.0.1");
  const db = new pg.Client({ connectionString: operator.href }); await db.connect();
  const { databasePool } = await import("../../lib/database.js");
  const { createPortalAuth, closeAuthDatabase } = await import("../../lib/auth.js");
  const consoleApi = await import("../../app/api/platform/agencies/route.js"), supportApi = await import("../../app/api/support/requests/route.js"), deliveryApi = await import("../../app/api/admin/aoc-clients/route.js");
  const prior = JSON.parse(await readFile(process.env.AGENCY_ISOLATION_FIXTURE, "utf8"));
  const aoc = prior.clients[0].agency, foreign = prior.clients[2].agency, accounts = {};
  const auth = createPortalAuth({ allowAccountCreation: true, useNextCookies: false });
  const headers = key => new Headers({ host: new URL(origin).host, origin, cookie: accounts[key].cookie, "Content-Type": "application/json" });
  const req = (path, key, body, extra = {}) => new Request(origin + path, { method: body ? "POST" : "GET", headers: new Headers({ ...Object.fromEntries(headers(key)), ...extra }), ...(body ? { body: JSON.stringify(body) } : {}) });
  const command = () => ({ action: "create", operation: randomUUID(), name: "Synthetic Redwood", slug: "s12-redwood", ownerAccount: accounts.agencyOwner.external, reason: "Synthetic local provisioning" });
  let agency;
  try {
    assert.equal((await db.query("SELECT current_database() name")).rows[0].name, operator.pathname.slice(1));
    assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.platform_memberships")).rows[0].n, 0, "migration never promotes an Admin");
    for (const [index, key] of ["owner", "operator", "agencyOwner", "agencyApprover", "clientApprover", "foreignStaff", "unrelated"].entries()) {
      const username = "s12." + key.toLowerCase(), password = randomBytes(24).toString("hex"), id = 2101 + index;
      const signed = await auth.api.signUpEmail({ body: { username, password, name: "Synthetic " + key, email: username + "@example.invalid" } });
      await db.query("INSERT INTO portal_users(id,external_id,display_name) VALUES($1,$2,$3)", [id, signed.user.id, "Synthetic " + key]);
      if (["owner", "operator"].includes(key)) await db.query("INSERT INTO agency_platform.platform_memberships(user_id,role,assignment_reason) VALUES($1,$2,'Synthetic local test only')", [id, key]);
      if (key === "agencyApprover") {
        await db.query("INSERT INTO portal_admins(user_id) VALUES($1)", [id]);
        await db.query("INSERT INTO agency_platform.memberships(agency_id,user_id,role) VALUES($1,$2,'agency_admin')", [aoc, id]);
      }
      if (key === "clientApprover") {
        await db.query("INSERT INTO portal_memberships(client_id,user_id,role) VALUES(501,$1,'client_admin')", [id]);
        await db.query("INSERT INTO agency_platform.memberships(agency_id,user_id,role) VALUES($1,$2,'client_user') ON CONFLICT(agency_id,user_id) DO UPDATE SET role=EXCLUDED.role,is_active=true", [aoc, id]);
        await db.query("INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level) VALUES($1,501,$2,'manage') ON CONFLICT(agency_id,client_id,user_id) DO UPDATE SET access_level=EXCLUDED.access_level,is_active=true", [aoc, id]);
      }
      if (key === "foreignStaff") await db.query("INSERT INTO agency_platform.memberships(agency_id,user_id,role) VALUES($1,$2,'agency_admin')", [foreign, id]);
      const login = await auth.api.signInUsername({ body: { username, password }, headers: new Headers({ origin }), asResponse: true }); assert.equal(login.status, 200);
      const session = (await db.query('SELECT id FROM "session" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1', [signed.user.id])).rows[0].id;
      accounts[key] = { id: String(id), external: signed.user.id, username, password, session, cookie: login.headers.getSetCookie().map(x => x.split(';')[0]).join('; ') };
    }
    await t.test("explicit owner/operator allowed; legacy Admin, agency, client and forged requests denied", async () => {
      for (const key of ["owner", "operator"]) assert.equal((await consoleApi.GET(req('/api/platform/agencies', key))).status, 200);
      for (const key of ["agencyOwner", "agencyApprover", "clientApprover", "foreignStaff", "unrelated"]) {
        const response = await consoleApi.GET(req('/api/platform/agencies?role=owner&agencyId=' + aoc, key));
        assert.equal(response.status, 403); assert.doesNotMatch(await response.text(), /Redwood|Orchid|Birch|AGENCY_A_ONLY|CANARY/);
        assert.equal((await consoleApi.POST(req('/api/platform/agencies', key, command(key)))).status, 403);
      }
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'operator', command()))).status, 403);
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', command(), { origin: 'https://foreign.invalid' }))).status, 403);
      assert.equal((await consoleApi.GET(req('/api/platform/agencies', 'owner', undefined, { host: 'foreign.invalid' }))).status, 403);
    });
    await t.test("create is atomic/idempotent with explicit owner and no inherited client/knowledge/credentials", async () => {
      const input = command(), first = await consoleApi.POST(req('/api/platform/agencies', 'owner', input)); assert.equal(first.status, 200);
      agency = await first.json();
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', input))).status, 200);
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', { ...input, name: 'Changed replay' }))).status, 409);
      assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.agencies WHERE slug='s12-redwood'")).rows[0].n, 1);
      assert.equal((await db.query("SELECT user_id::text FROM agency_platform.agency_owners WHERE agency_id=$1", [agency.id])).rows[0].user_id, accounts.agencyOwner.id);
      for (const table of ['client_ownership', 'memberships', 'connection_bindings', 'job_runs']) assert.equal((await db.query(`SELECT count(*)::int n FROM agency_platform.${table} WHERE agency_id=$1`, [agency.id])).rows[0].n, 0);
      assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.platform_memberships WHERE user_id=$1", [accounts.agencyOwner.id])).rows[0].n, 0);
      const before = (await db.query("SELECT count(*)::int n FROM agency_platform.agencies")).rows[0].n;
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', { ...command(), operation: randomUUID(), slug: 's12-invalid', ownerAccount: 'nonexistent' }))).status, 400);
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', { ...command(), role: 'owner' }))).status, 400);
      assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.agencies")).rows[0].n, before);
    });
    await t.test("directory search/counts/metadata omit private content and distinguish cost/subscription availability", async () => {
      for (const [key, client, basis, amount] of [['known', '501', 'reported', '0.25'], ['unknown', '501', 'unknown', null], ['foreign', '1101', 'reported', '37']]) {
        await db.query("INSERT INTO portal_ai_cost_events(event_key,request_id,client_id,provider,model,kind,status,basis,amount_usd,reason,occurred_at) VALUES($1,$2,$3,'openai','synthetic-model','chat','succeeded',$4,$5,'Synthetic platform summary',now())", ['s12-' + key, randomUUID(), client, basis, amount]);
      }
      const response = await consoleApi.GET(req('/api/platform/agencies?q=redwood&status=active', 'operator')); assert.equal(response.status, 200);
      assert.match(response.headers.get('cache-control'), /private, no-store/);
      const data = await response.json(); assert.equal(data.total, 1); assert.equal(data.agencies[0].owner.account, accounts.agencyOwner.external);
      assert.equal(data.agencies[0].subscription, 'Not configured'); assert.equal(data.canManage, false);
      const all = await (await consoleApi.GET(req('/api/platform/agencies', 'owner'))).json();
      const aocCosts = all.agencies.find(a => a.id === aoc).costs;
      assert.equal(Number(aocCosts.usd), 0.25); assert.equal(aocCosts.unknown, 1); assert.equal(aocCosts.events, 2);
      assert.equal(Number(all.agencies.find(a => a.id === foreign).costs.usd), 37);
      assert.doesNotMatch(JSON.stringify(data), /CANARY|encrypted_refresh_token|PRIVATE_ADMIN|AGENCY_A_ONLY|S11_CANARY/);
      assert.equal((await consoleApi.GET(req('/api/platform/agencies?page=-1', 'owner'))).status, 400);
    });
    await t.test("runtime cannot read or mutate console ledgers; pooled connections retain no console privilege", async () => {
      for (const table of ['platform_memberships', 'agency_owners', 'platform_audit', 'support_requests']) {
        await assert.rejects(databasePool.query(`SELECT * FROM agency_platform.${table}`), { code: '42501' });
        await assert.rejects(databasePool.query(`DELETE FROM agency_platform.${table}`), { code: '42501' });
        const flags = (await db.query("SELECT relrowsecurity r,relforcerowsecurity f FROM pg_class WHERE oid=$1::regclass", ['agency_platform.' + table])).rows[0]; assert.ok(flags.r && flags.f);
      }
      assert.equal((await consoleApi.GET(req('/api/platform/agencies', 'owner'))).status, 200);
      assert.equal((await consoleApi.GET(req('/api/platform/agencies', 'unrelated'))).status, 403);
      assert.equal((await databasePool.query('SELECT current_user=session_user AS clean')).rows[0].clean, true);
    });
    await t.test("role revocation, demotion and expired sessions affect already-signed-in owners", async () => {
      await db.query("UPDATE agency_platform.platform_memberships SET is_active=false WHERE user_id=$1", [accounts.owner.id]);
      assert.equal((await consoleApi.GET(req('/api/platform/agencies', 'owner'))).status, 403);
      await db.query("UPDATE agency_platform.platform_memberships SET is_active=true,role='operator' WHERE user_id=$1", [accounts.owner.id]);
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', command()))).status, 403);
      await db.query("UPDATE agency_platform.platform_memberships SET role='owner' WHERE user_id=$1", [accounts.owner.id]);
      await db.query('UPDATE "session" SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1', [accounts.owner.session]);
      assert.equal((await consoleApi.GET(req('/api/platform/agencies', 'owner'))).status, 401);
      // Better Auth deletes an expired session; obtain a new real session,
      // rather than pretending a deleted fixture row can be revived.
      const login = await auth.api.signInUsername({ body: { username: accounts.owner.username, password: accounts.owner.password }, headers: new Headers({ origin }), asResponse: true });
      assert.equal(login.status, 200);
      accounts.owner.cookie = login.headers.getSetCookie().map(x => x.split(';')[0]).join('; ');
      accounts.owner.session = (await db.query('SELECT id FROM "session" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1', [accounts.owner.external])).rows[0].id;
      await db.query("INSERT INTO portal_internal_users(user_id,hubstaff_user_id,is_active) VALUES($1,918001,false)", [accounts.operator.id]);
      assert.equal((await consoleApi.GET(req('/api/platform/agencies', 'operator'))).status, 403, 'inactive Internal identity cannot fall back to platform access');
      await db.query("DELETE FROM portal_internal_users WHERE user_id=$1", [accounts.operator.id]);
    });
    await t.test("support requires two distinct live approvers; requester/foreign consent cannot authorize private content", async () => {
      const operation = randomUUID(); accounts.supportRequest = operation;
      assert.equal((await supportApi.POST(req('/api/support/requests', 'owner', { action: 'request', operation, clientId: '501', reason: 'Synthetic status diagnosis', ticket: 'LOCAL-12' }))).status, 200);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'owner', { action: 'approve', id: operation, capacity: 'agency' }))).status, 403);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'foreignStaff', { action: 'approve', id: operation, capacity: 'agency' }))).status, 403);
      assert.deepEqual((await (await supportApi.GET(req('/api/support/requests', 'foreignStaff'))).json()).requests, []);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'owner', { action: 'check', id: operation }))).status, 403);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'agencyApprover', { action: 'approve', id: operation, capacity: 'agency' }))).status, 200);
      // Both capacities cannot be approved by the same account, even with forged roles.
      await db.query("INSERT INTO portal_memberships(client_id,user_id,role) VALUES(501,$1,'client_admin')", [accounts.agencyApprover.id]);
      await db.query("INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level) VALUES($1,501,$2,'manage') ON CONFLICT(agency_id,client_id,user_id) DO UPDATE SET access_level=EXCLUDED.access_level,is_active=true", [aoc, accounts.agencyApprover.id]);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'agencyApprover', { action: 'approve', id: operation, capacity: 'client' }))).status, 403);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'clientApprover', { action: 'approve', id: operation, capacity: 'client' }))).status, 200);
      const checked = await supportApi.POST(req('/api/support/requests', 'owner', { action: 'check', id: operation })); assert.equal(checked.status, 200); assert.deepEqual(await checked.json(), { status: { portalEnabled: true } });
      await db.query("UPDATE agency_platform.memberships SET is_active=false WHERE user_id=$1 AND agency_id=$2", [accounts.agencyApprover.id, aoc]);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'owner', { action: 'check', id: operation }))).status, 403);
      await db.query("UPDATE agency_platform.memberships SET is_active=true WHERE user_id=$1 AND agency_id=$2", [accounts.agencyApprover.id, aoc]);
      assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.support_access_log WHERE grant_id=$1 AND outcome='exercised'", [operation])).rows[0].n, 1);
    });
    await t.test("support denial, explicit revocation and pending expiry are enforced", async () => {
      const create = async () => {
        const operation = randomUUID();
        assert.equal((await supportApi.POST(req('/api/support/requests', 'owner', { action: 'request', operation, clientId: '501', reason: 'Synthetic consent lifecycle', ticket: 'LOCAL-12-REVOKE' }))).status, 200);
        return operation;
      };
      const operation = await create();
      for (const [key, capacity] of [['agencyApprover', 'agency'], ['clientApprover', 'client']]) assert.equal((await supportApi.POST(req('/api/support/requests', key, { action: 'approve', id: operation, capacity }))).status, 200);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'clientApprover', { action: 'revoke', id: operation, capacity: 'client' }))).status, 200);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'owner', { action: 'check', id: operation }))).status, 403);
      const denied = await create();
      assert.equal((await supportApi.POST(req('/api/support/requests', 'agencyApprover', { action: 'deny', id: denied, capacity: 'agency' }))).status, 200);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'clientApprover', { action: 'approve', id: denied, capacity: 'client' }))).status, 403);
      const expired = await create();
      await db.query("UPDATE agency_platform.support_requests SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1", [expired]);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'agencyApprover', { action: 'approve', id: expired, capacity: 'agency' }))).status, 403);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'owner', { action: 'request', operation: randomUUID(), clientId: '1101', reason: 'Foreign attempt', ticket: 'FOREIGN' }))).status, 403);
    });
    await t.test("suspension/reactivation fences jobs, callbacks and support; preserves data and rejects stale/replayed changes", async () => {
      const initial = (await db.query("SELECT state_version::text version,slug FROM agency_platform.agencies WHERE id=$1", [aoc])).rows[0];
      const legacyBefore = (await db.query("SELECT count(*)::int n FROM portal_chatkit_threads")).rows[0].n;
      const tokensBefore = (await db.query("SELECT count(*)::int n FROM agency_platform.connection_bindings")).rows[0].n;
      await db.query("INSERT INTO agency_platform.job_runs(kind,resource,agency_id,client_id,version,token,lease_until) VALUES('hubstaff','501',$1,501,'fixture',$2,now()+interval '5 minutes') ON CONFLICT(kind,resource) DO UPDATE SET token=EXCLUDED.token,lease_until=EXCLUDED.lease_until", [aoc, randomUUID()]);
      const generation = (await db.query("SELECT sum(generation)::bigint g FROM agency_platform.connection_bindings WHERE agency_id=$1", [aoc])).rows[0].g;
      const input = { action: 'suspend', operation: randomUUID(), reason: 'Synthetic pause', agencyId: aoc, confirmation: initial.slug, version: initial.version };
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', { ...input, confirmation: 'wrong' }))).status, 409);
      const paused = await consoleApi.POST(req('/api/platform/agencies', 'owner', input)); assert.equal(paused.status, 200); const state = await paused.json();
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', input))).status, 200);
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', { ...input, operation: randomUUID() }))).status, 409);
      assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.job_runs WHERE agency_id=$1 AND token IS NOT NULL", [aoc])).rows[0].n, 0);
      if (generation != null) assert.ok(BigInt((await db.query("SELECT sum(generation)::bigint g FROM agency_platform.connection_bindings WHERE agency_id=$1", [aoc])).rows[0].g) > BigInt(generation));
      assert.equal((await deliveryApi.GET(req('/api/admin/aoc-clients', 'agencyApprover'))).status, 403);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'owner', { action: 'check', id: accounts.supportRequest }))).status, 403);
      const restored = await consoleApi.POST(req('/api/platform/agencies', 'owner', { ...input, action: 'reactivate', operation: randomUUID(), version: state.version })); assert.equal(restored.status, 200);
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_chatkit_threads")).rows[0].n, legacyBefore);
      assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.connection_bindings")).rows[0].n, tokensBefore);
      assert.equal((await supportApi.POST(req('/api/support/requests', 'owner', { action: 'check', id: accounts.supportRequest }))).status, 403);
      assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.platform_audit WHERE operation=$1", [input.operation])).rows[0].n, 1);
    });
    await t.test("AOC delivery remains scoped in mixed estate; platform privilege alone cannot edit AOC clients", async () => {
      const response = await deliveryApi.GET(req('/api/admin/aoc-clients', 'agencyApprover')); assert.equal(response.status, 200);
      const data = await response.json(); assert.ok(data.clients.some(c => c.id === '501')); assert.ok(!data.clients.some(c => ['1101', '1102'].includes(c.id)));
      for (const key of ['owner', 'operator', 'foreignStaff', 'clientApprover']) assert.equal((await deliveryApi.GET(req('/api/admin/aoc-clients', key))).status, 403);
      const patch = (clientId, enabled) => new Request(origin + '/api/admin/aoc-clients', { method: 'PATCH', headers: headers('agencyApprover'), body: JSON.stringify({ clientId, portalEnabled: enabled, aiEnabled: true }) });
      assert.equal((await deliveryApi.PATCH(patch('1101', false))).status, 403);
      assert.equal((await deliveryApi.PATCH(patch('501', true))).status, 200);
      assert.equal((await db.query("SELECT portal_enabled FROM portal_clients WHERE id=1101")).rows[0].portal_enabled, true);
      assert.equal((await db.query("SELECT agency_platform.legacy_admin_scope_safe() allowed")).rows[0].allowed, false);
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_audit_events WHERE actor_user_id=$1 AND action='aoc.client.access.update'", [accounts.agencyApprover.id])).rows[0].n, 1);
    });
    await t.test("concurrent lifecycle commands serialize; one stale version is rejected", async () => {
      const pause = { action: 'suspend', agencyId: agency.id, confirmation: agency.slug, version: '0', reason: 'Synthetic concurrent pause' };
      const responses = await Promise.all([consoleApi.POST(req('/api/platform/agencies', 'owner', { ...pause, operation: randomUUID() })), consoleApi.POST(req('/api/platform/agencies', 'owner', { ...pause, operation: randomUUID() }))]);
      assert.deepEqual(responses.map(r => r.status).sort(), [200, 409]);
      assert.equal((await consoleApi.POST(req('/api/platform/agencies', 'owner', { ...pause, action: 'reactivate', version: '1', operation: randomUUID() }))).status, 200);
    });
    assert.match(process.env.PLATFORM_CONSOLE_FIXTURE.replaceAll('\\', '/'), /\/\.tmp\/.+\/platform-fixture\.json$/);
    await writeFile(process.env.PLATFORM_CONSOLE_FIXTURE, JSON.stringify({ origin, database: operator.pathname, aoc, foreign, agency, accounts, legacy: prior }), { mode: 0o600 });
  } finally { await closeAuthDatabase(); await db.end(); }
});
