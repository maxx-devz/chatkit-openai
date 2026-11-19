import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import pg from 'pg';
import {runtimeDatabasePool,RUNTIME_ROLE_SQL} from '../../lib/runtime-database-role.js';

test('Stage 11 actual runtime connectors reject policy-bypassing database roles',{skip:!process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL},async t=>{
  const owner=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL),app=new URL(process.env.DATABASE_URL);
  assert.equal(owner.hostname,'127.0.0.1');assert.match(owner.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);
  assert.equal(owner.host,app.host);assert.equal(owner.pathname,app.pathname);assert.notEqual(owner.username,app.username);
  const operator=new pg.Client({connectionString:owner.href});await operator.connect();
  const role='aoc_s11_role_'+randomBytes(6).toString('hex'),password=randomBytes(24).toString('hex');
  const url=new URL(app);url.username=role;url.password=password;
  const raw=new pg.Pool({connectionString:url.href,max:1}),guarded=runtimeDatabasePool(raw);
  const privileged=new pg.Pool({connectionString:owner.href,max:1});
  const python=(connectionString,allowed)=>{
    const result=spawnSync(process.env.STAGE06_PYTHON||'.venv/Scripts/python.exe',['-m','unittest','discover','-s','chatkit_backend/tests','-p','test_runtime_role_database.py'],
      {encoding:'utf8',env:{...process.env,DATABASE_URL:connectionString,STAGE11_EXPECT_RUNTIME_SAFE:allowed?'yes':'no'}});
    assert.equal(result.status,0,'Python runtime role probe failed: '+result.stdout+result.stderr);
  };
  let applicationPool;
  try {
    const {databasePool}=await import('../../lib/database.js');
    applicationPool=databasePool;
    const {auth,createPortalAuth}=await import('../../lib/auth.js');
    await t.test('actual Next DAL and Better Auth share a checked non-owner app pool; Python uses the same safe contract',async()=>{
      assert.equal(auth.options.database,databasePool);
      assert.equal(createPortalAuth({allowAccountCreation:true,useNextCookies:false}).options.database,databasePool);
      const {rows:[facts]}=await databasePool.query(RUNTIME_ROLE_SQL);
      assert.equal(facts.adopted,true);assert.equal(facts.allowed,true);
      for(const key of ['changed_role','elevated_role','database_owner','schema_owner','relation_owner'])assert.equal(facts[key],false,key);
      const diagnostic=spawnSync(process.execPath,['scripts/check-runtime-database-role.mjs','--confirm-database',app.pathname.slice(1)],{encoding:'utf8',env:process.env});
      assert.equal(diagnostic.status,0,diagnostic.stdout+diagnostic.stderr);assert.equal(JSON.parse(diagnostic.stdout).allowed,true);
      python(app.href,true);
    });
    await operator.query(`CREATE ROLE "${role}" LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
    await t.test('owner/superuser runtime is rejected in both actual connectors',async()=>{
      await assert.rejects(runtimeDatabasePool(privileged).query('SELECT 1'),{code:'unsafe_runtime_database_role'});
      const canonical=spawnSync(process.execPath,['--conditions=react-server','--input-type=module','-e',`
        import {databasePool} from './lib/database.js';
        try {await databasePool.query('SELECT 1');process.exitCode=1;}
        catch(error){if(error.code!=='unsafe_runtime_database_role')process.exitCode=1;}
        finally {await databasePool.end();}`],{encoding:'utf8',env:{...process.env,DATABASE_URL:owner.href}});
      assert.equal(canonical.status,0,canonical.stdout+canonical.stderr);
      const diagnostic=spawnSync(process.execPath,['scripts/check-runtime-database-role.mjs','--confirm-database',app.pathname.slice(1)],{encoding:'utf8',env:{...process.env,DATABASE_URL:owner.href}});
      assert.equal(diagnostic.status,1);assert.equal(JSON.parse(diagnostic.stdout).allowed,false);
      python(owner.href,false);
    });
    await t.test('a pooled SET ROLE is rejected and discarded rather than carried into another request',async()=>{
      await operator.query(`GRANT aoc_agency_runtime TO "${role}"`);
      const leased=await raw.connect();await leased.query('SET ROLE aoc_agency_runtime');leased.release();
      await assert.rejects(guarded.query('SELECT 1'),{code:'unsafe_runtime_database_role'});
      assert.equal((await guarded.query('SELECT 1 value')).rows[0].value,1);
    });
    await t.test('granting owner membership to a pooled ordinary login enables raw RLS access but the runtime guard rejects it',async()=>{
      assert.equal((await guarded.query('SELECT 1 value')).rows[0].value,1);
      await operator.query(`GRANT aoc_agency_owner TO "${role}"`);
      assert.ok((await raw.query('SELECT count(*) FROM agency_platform.job_runs')).rowCount);
      await assert.rejects(guarded.query('SELECT count(*) FROM agency_platform.job_runs'),{code:'unsafe_runtime_database_role'});
      python(url.href,false);
      await operator.query(`REVOKE aoc_agency_owner FROM "${role}"`);
      assert.equal((await guarded.query('SELECT 1 value')).rows[0].value,1);
    });
    await t.test('BYPASSRLS and portal relation ownership cannot be used as runtime credentials',async()=>{
      await operator.query(`ALTER ROLE "${role}" BYPASSRLS`);
      await assert.rejects(guarded.query('SELECT 1'),{code:'unsafe_runtime_database_role'});python(url.href,false);
      await operator.query(`ALTER ROLE "${role}" NOBYPASSRLS`);
      await operator.query('CREATE TABLE public.portal_role_probe(id integer)');
      await operator.query(`ALTER TABLE public.portal_role_probe OWNER TO "${role}"`);
      await assert.rejects(guarded.query('SELECT 1'),{code:'unsafe_runtime_database_role'});python(url.href,false);
      await operator.query('DROP TABLE public.portal_role_probe');
    });
  } finally {
    await applicationPool?.end();
    await raw.end();await privileged.end();
    await operator.query('DROP TABLE IF EXISTS public.portal_role_probe');
    await operator.query(`DROP ROLE IF EXISTS "${role}"`);await operator.end();
  }
});
