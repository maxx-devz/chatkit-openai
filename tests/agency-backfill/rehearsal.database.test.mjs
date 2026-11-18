// Explicitly local, synthetic acceptance only. Never loads .env.local.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { backfillLegacy } from '../../scripts/migrate-agency-backfill.mjs';
import { databaseSnapshot } from './fixture.mjs';
import { withAgencyScope } from '../../lib/agency-scope.js';
import { quoteIdentifier } from '../../scripts/agency-backfill-plan.mjs';

const enabled=process.env.AGENCY_BACKFILL_DATABASE_URL && process.env.DATABASE_URL;
test('Stage 04 migrated synthetic database acceptance', {skip:!enabled}, async t=>{
  const target=new URL(process.env.AGENCY_BACKFILL_DATABASE_URL);
  const appTarget=new URL(process.env.DATABASE_URL);
  assert.equal(target.hostname,'127.0.0.1');
  assert.match(target.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);
  assert.equal(appTarget.host,target.host);assert.equal(appTarget.pathname,target.pathname);
  assert.notEqual(appTarget.username,target.username);
  const admin=new pg.Client({connectionString:target.href});
  const pools=[],roles=[];
  let appPool;
  await admin.connect();
  try {
    assert.equal((await admin.query("SELECT count(*)::int n FROM portal_users WHERE external_id IN ('fixture-mira','fixture-ben')")).rows[0].n,2);
    const state=(await admin.query('SELECT aoc_agency_id::text id,active FROM agency_platform.backfill_state WHERE id=1')).rows[0];
    assert.equal(state.active,true);
    const aoc=state.id,harbor=(await admin.query("SELECT id::text FROM agency_platform.agencies WHERE slug='harbor-fixture'")).rows[0].id;
    const legacyRole=decodeURIComponent(appTarget.username);
    const manifest={version:1,clientIds:['501','502'],agencyAdminUserIds:['300'],operatorUserId:'300',
      companyGuidance:[{owner_id:'300',audience:'clients'}],approvalReference:'synthetic-stage04-reviewed',legacyAppRole:legacyRole};
    await t.test('ownership counts, quarantine, history and non-elevated customer membership',async()=>{
      assert.deepEqual((await admin.query('SELECT scope_kind,count(*)::int n FROM agency_platform.legacy_ownership GROUP BY 1 ORDER BY 1')).rows,
        [{scope_kind:'agency',n:1},{scope_kind:'client',n:27},{scope_kind:'platform_private',n:16},{scope_kind:'quarantined',n:7}]);
      assert.equal((await admin.query('SELECT count(*)::int n FROM agency_platform.backfill_batches')).rows[0].n,1);
      assert.equal((await admin.query("SELECT role FROM agency_platform.memberships WHERE agency_id=$1 AND user_id=301",[aoc])).rows[0].role,'client_user');
      assert.equal((await admin.query('SELECT pricing_id::text FROM portal_ai_credit_periods WHERE client_id=501')).rows[0].pricing_id,'11');
      assert.equal((await admin.query('SELECT count(*)::int n FROM portal_ai_usage_resets')).rows[0].n,1);
      assert.equal((await admin.query('SELECT count(*)::int n FROM portal_ai_usage_events WHERE cleared_at IS NOT NULL')).rows[0].n,1);
      assert.equal((await admin.query("SELECT convert_from(content,'UTF8') body FROM portal_chatkit_uploads WHERE id='upload_legacy'")).rows[0].body,'Synthetic legacy bytes');
    });
    await t.test('foreign-owner conflict refuses the complete application without writes',async()=>{
      const before=await databaseSnapshot(admin);
      const report=await backfillLegacy(admin,{...manifest,clientIds:['501','601']},{apply:true});
      assert.equal(report.applied,false);
      assert.ok(report.conflicts.some(c=>c.reason==='foreign_agency_owner'));
      assert.deepEqual(await databaseSnapshot(admin),before);
    });
    await t.test('write freeze blocks concurrent legacy writes',async()=>{
      const writer=new pg.Client({connectionString:appTarget.href});await writer.connect();
      try {
        await admin.query('BEGIN');await admin.query('LOCK TABLE portal_chatkit_threads IN SHARE MODE');
        await writer.query('BEGIN');await writer.query("SET LOCAL lock_timeout='150ms'");
        await assert.rejects(writer.query("INSERT INTO portal_chatkit_threads(client_id,user_id,id,data) VALUES(501,301,'thr_blocked','{}')"),{code:'55P03'});
      } finally {await writer.query('ROLLBACK');await writer.end();await admin.query('ROLLBACK');}
    });
    for(const agency of [aoc,harbor]) {
      const role='aoc_s04_scope_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
      await admin.query(`CREATE ROLE ${quoteIdentifier(role)} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS IN ROLE aoc_agency_runtime PASSWORD '${password}'`);
      roles.push(role);
      await admin.query('INSERT INTO agency_platform.database_principals(login_role,agency_id) VALUES($1,$2)',[role,agency]);
      const url=new URL(target);url.username=role;url.password=password;
      pools.push(new pg.Pool({connectionString:url.href,max:1}));
    }
    const ownScope={agencyId:aoc,actorId:'301',clientId:'501'},foreignScope={agencyId:harbor,actorId:'302',clientId:'601'};
    const read=(db,relation,key)=>db.query('SELECT agency_platform.owned_legacy_record($1,$2) data',[relation,key]).then(r=>r.rows[0].data);
    await t.test('ordinary agency reads deny foreign, private and quarantined records',async()=>{
      await withAgencyScope(pools[0],ownScope,async db=>{
        assert.equal((await read(db,'portal_chatkit_threads',{client_id:'501',user_id:'301',id:'thr_legacy_aoc'})).data.title,'Legacy Work');
        assert.equal(await read(db,'portal_chatkit_threads',{client_id:'601',user_id:'302',id:'thr_harbor'}),null);
        assert.equal(await read(db,'portal_chatkit_threads',{client_id:'501',user_id:'304',id:'thr_inactive'}),null);
        assert.equal((await read(db,'portal_source_publications',{owner_id:'300',audience:'clients'})).additional_instructions,'Fictional AOC guidance');
        for(const [relation,key] of [['portal_source_publications',{owner_id:'303',audience:'client:501'}],
          ['portal_legacy_fixture_notes',{id:'901'}],['portal_legacy_fixture_notes',{id:'902'}],
          ['portal_ai_credentials',{provider:'openai'}],['portal_ai_credit_pricing',{id:'11'}]]) assert.equal(await read(db,relation,key),null);
      });
      await withAgencyScope(pools[1],foreignScope,async db=>{
        assert.equal((await read(db,'portal_chatkit_threads',{client_id:'601',user_id:'302',id:'thr_harbor'})).data.title,'Fictional Harbor history');
        assert.equal(await read(db,'portal_source_publications',{owner_id:'300',audience:'clients'}),null);
        assert.equal(await read(db,'portal_client_library',{id:'lib_aoc'}),null);
      });
      await assert.rejects(pools[0].query('SELECT * FROM portal_chatkit_threads'),{code:'42501'});
      await assert.rejects(pools[0].query('SELECT * FROM agency_platform.legacy_ownership'),{code:'42501'});
      await assert.rejects(withAgencyScope(pools[0],foreignScope,()=>assert.fail('foreign agency accepted')),{code:'agency_scope_denied'});
    });
    await t.test('same backend is clean after scoped commit and rollback',async()=>{
      const first=await withAgencyScope(pools[0],ownScope,async db=>(await db.query('SELECT pg_backend_pid() id')).rows[0].id);
      await assert.rejects(withAgencyScope(pools[0],ownScope,async db=>{await db.query('SELECT 1');throw Error('synthetic rollback');}),/synthetic rollback/);
      assert.equal(await withAgencyScope(pools[0],ownScope,async db=>(await db.query('SELECT pg_backend_pid() id')).rows[0].id),first);
      assert.equal((await pools[0].query("SELECT agency_platform.current_agency() IS NULL AND NULLIF(current_setting('aoc.actor_id',true),'') IS NULL clean")).rows[0].clean,true);
    });
    let sessionUser={id:'fixture-mira',email:'mira@example.invalid',name:'Fixture AOC User'};
    mock.module(new URL('../../lib/auth.js',import.meta.url).href,{namedExports:{auth:{api:{getSession:async()=>({user:sessionUser})}},isPortalAuthConfigured:()=>true}});
    mock.module(new URL('../../lib/internal-user-access.js',import.meta.url).href,{namedExports:{assertNotInternalUser:async()=>{}}});
    const portal=await import('../../lib/portal-data.js');
    const sources=await import('../../lib/prepared-source-store.js');
    const credits=await import('../../lib/credits-repository.js');
    appPool=(await import('../../lib/database.js')).databasePool;
    process.env.BETTER_AUTH_URL ||= "http://127.0.0.1:3000";
    const headers=new Headers({host:new URL(process.env.BETTER_AUTH_URL).host,cookie:'aoc_active_client=s04-orchid'});
    await t.test('existing authenticated AOC DAL paths use real migrated SQL',async()=>{
      const context=await portal.resolvePortalContext(headers);
      assert.equal(context.client.id,'501');assert.equal(context.user.id,'301');
      assert.deepEqual(context.memberships.map(c=>c.slug).sort(),['s04-birch','s04-orchid']);
      const workspace=await portal.loadPortalWorkspace(headers);assert.equal(workspace.revision,7);assert.deepEqual(workspace.workspace,{fixture:'legacy workspace'});
      assert.equal((await portal.listPortalConversations(headers,'work')).find(c=>c.id==='thr_legacy_aoc').messageCount,2);
      assert.deepEqual((await portal.listPortalConversations(headers,'general')).map(c=>c.id),['thr_general_aoc']);
      assert.ok(await portal.loadPortalAiAccess(headers));
      const report=await credits.readClientCredits(appPool,'501',{period:'2025-07',readOnly:true});
      assert.ok(report);assert.equal((await appPool.query('SELECT pricing_id::text FROM portal_ai_credit_periods WHERE client_id=501')).rows[0].pricing_id,'11');
      await assert.rejects(sources.findApplicablePreparedPublications({clientId:'501'}),e=>e.code==='source_approval_required');
      await assert.rejects(sources.findApplicablePreparedPublications({clientId:'601'}),e=>e.code==='source_approval_required');
      sessionUser={id:'fixture-ben',email:'ben@example.invalid',name:'Fixture Harbor User'};
      await assert.rejects(portal.resolvePortalContext(headers),e=>e.publicDetails?.status===403);
      sessionUser={id:'fixture-mira',email:'mira@example.invalid',name:'Fixture AOC User'};
    });
    await t.test('post-cutover writes gain ownership atomically; membership revocation persists',async()=>{
      const id='thr_'+randomBytes(16).toString('hex');
      await appPool.query('INSERT INTO portal_chatkit_threads(client_id,user_id,id,data) VALUES(501,301,$1,$2)',[id,{id,title:'New synthetic draft'}]);
      await portal.renamePortalConversation(headers,id,'Renamed synthetic draft');
      await withAgencyScope(pools[0],ownScope,async db=>assert.equal((await read(db,'portal_chatkit_threads',{client_id:'501',user_id:'301',id})).data.title,'Renamed synthetic draft'));
      await appPool.query('DELETE FROM portal_chatkit_threads WHERE id=$1',[id]);
      assert.equal((await admin.query('SELECT scope_kind,reason FROM agency_platform.legacy_ownership WHERE relation_name=$1 AND record_key=$2',['portal_chatkit_threads',{client_id:'501',user_id:'301',id}])).rows[0].scope_kind,'quarantined');
      const writer=await appPool.connect();
      try {
        await writer.query('BEGIN');
        await writer.query('UPDATE portal_memberships SET is_active=false WHERE client_id IN (501,502) AND user_id=301');
        assert.equal((await writer.query('SELECT is_active FROM portal_memberships WHERE client_id=501 AND user_id=301')).rows[0].is_active,false);
        await writer.query('COMMIT');
        await assert.rejects(withAgencyScope(pools[0],ownScope,()=>assert.fail('revoked member accepted')),{code:'agency_scope_denied'});
      } finally {
        await writer.query('ROLLBACK');
        await writer.query('UPDATE portal_memberships SET is_active=true WHERE client_id IN (501,502) AND user_id=301');
        writer.release();
      }
      await withAgencyScope(pools[0],ownScope,db=>db.query('SELECT 1'));
    });
    await t.test('disabled company publisher is immediately excluded',async()=>{
      await admin.query('UPDATE portal_admins SET is_active=false WHERE user_id=300');
      try {
        await assert.rejects(sources.findApplicablePreparedPublications({clientId:'501'}),e=>e.code==='source_approval_required');
        await withAgencyScope(pools[0],ownScope,async db=>assert.equal(await read(db,'portal_source_publications',{owner_id:'300',audience:'clients'}),null));
      } finally {await admin.query('UPDATE portal_admins SET is_active=true WHERE user_id=300');}
    });
  } finally {
    try {
      if(appPool) await appPool.end();
      for(const pool of pools) await pool.end();
      for(const role of roles) {
        await admin.query('DELETE FROM agency_platform.database_principals WHERE login_role=$1',[role]);
        await admin.query(`DROP ROLE ${quoteIdentifier(role)}`);
      }
    } finally {
      await admin.end();
      mock.restoreAll();
    }
  }
});
