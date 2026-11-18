import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import pg from "pg";

test("Stage 10 jobs use live ownership, durable fencing and bounded capacity",{skip:!process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL},async t=>{
  const url=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL),app=new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);
  assert.equal(url.host,app.host);assert.equal(url.pathname,app.pathname);assert.notEqual(url.username,app.username);
  const db=new pg.Client({connectionString:url.href});await db.connect();
  const {databasePool}=await import("../../lib/database.js");
  try {
    assert.equal((await db.query("SELECT current_database() name")).rows[0].name,url.pathname.slice(1));
    for(const file of ["hubstaff-search-schema.sql","prepared-source-schema.sql"]) await db.query(await readFile(new URL("../../database/"+file,import.meta.url),"utf8"));
    await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO "${app.username}"`);
    // Fixture prerequisites grant the dedicated owner read access; it cannot
    // mutate the legacy results through the new SECURITY DEFINER functions.
    await db.query("GRANT SELECT ON ALL TABLES IN SCHEMA public TO aoc_agency_owner");
    for(let i=0;i<2;i++) {
      const migrated=spawnSync(process.execPath,["scripts/migrate-agency-jobs.mjs","--confirm-database",url.pathname.slice(1),"--app-role",app.username],{encoding:"utf8",env:process.env});
      assert.equal(migrated.status,0,migrated.stdout+migrated.stderr);
    }
    assert.deepEqual((await db.query("SELECT relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='agency_platform.job_runs'::regclass")).rows[0],{relrowsecurity:true,relforcerowsecurity:true});
    assert.equal((await db.query("SELECT rolcanlogin FROM pg_roles WHERE rolname='aoc_agency_owner'")).rows[0].rolcanlogin,false);
    const aoc=(await db.query("SELECT aoc_agency_id::text id FROM agency_platform.backfill_state")).rows[0].id;
    const foreign=(await db.query("SELECT id::text FROM agency_platform.agencies WHERE slug='harbor-fixture'")).rows[0].id;
    for(let id=901;id<=908;id++) {
      await db.query("INSERT INTO portal_clients(id,slug,display_name,portal_enabled,ai_enabled,hubstaff_project_url) VALUES($1,$2,'Synthetic worker client',true,true,$3)",[id,"s10-"+id,`https://tasks.hubstaff.com/app/organizations/1/projects/${id}`]);
      await db.query("INSERT INTO agency_platform.client_ownership(agency_id,client_id) VALUES($1,$2)",[id===908?foreign:aoc,id]);
    }
    Object.assign(process.env,{GOOGLE_DRIVE_CLIENT_ID:"fixture.apps.googleusercontent.com",GOOGLE_DRIVE_CLIENT_SECRET:"fixture-only",
      GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY:"fixture-drive-secret-at-least-32-characters",GOOGLE_DRIVE_ALLOWED_EMAIL:"fixture@example.invalid",GOOGLE_DRIVE_ROOT_FOLDER_ID:"fixture_root_12345",
      HUBSTAFF_ACCESS_TOKEN:"synthetic-worker-credential"});
    await db.query("INSERT INTO portal_drive_source_connections(owner_id,google_email,google_subject,oauth_client_id,root_folder_id,encrypted_refresh_token) VALUES(300,'fixture@example.invalid','synthetic','fixture.apps.googleusercontent.com','fixture_root_12345','not-a-real-token')");
    let hook=null,providerCalls=0;
    t.mock.module("../../lib/hubstaff.js",{namedExports:{createHubstaffSearchReader:async()=>({
      metadata:async()=>{providerCalls++;if(hook)await hook();return {columns:new Map([["7",{name:"Doing"}]]),members:{}};},
      tasks:async()=>({items:[{id:71,list_id:7,subject:"Synthetic indexed task",description:"Only AOC 901",assignee_ids:[],done:false}],next:null}),
      comments:async()=>({items:[],next:null}),
    })}});
    const driveStatus=async()=>{const row=(await db.query("SELECT google_email,root_folder_id,connected_at FROM portal_drive_source_connections WHERE owner_id=300")).rows[0];
      return {connected:Boolean(row),email:row?.google_email,rootFolderId:row?.root_folder_id,connectedAt:row?.connected_at};};
    const doc={id:"synthetic_doc_123",name:"Synthetic instructions",path:"Synthetic instructions",folders:[],version:"1",modifiedTime:"2026-11-01",previewSupported:true};
    t.mock.module("../../lib/drive-source-service.js",{namedExports:{driveConnectionStatus:driveStatus,
      discoverConnectedSources:async()=>{providerCalls++;if(hook)await hook();return {rootName:"Synthetic root",files:[doc]};},
      previewConnectedSource:async()=>({...doc,text:"Synthetic approved source content"}),
    }});
    const worker=await import("../../lib/hubstaff-search-sync.js"),sources=await import("../../lib/prepared-source-sync.js");
    const jobs=await import("../../lib/background-jobs.js"),store=await import("../../lib/website-insights/store.js");
    const sessionRow=(await db.query('SELECT u.external_id,s.id FROM portal_users u JOIN "session" s ON s."userId"=u.external_id WHERE u.id=301 ORDER BY s."createdAt" DESC LIMIT 1')).rows[0];
    const context={client:{id:"501"},agency:{id:aoc},user:{id:"301"},session:{user:{id:sessionRow.external_id},session:{id:sessionRow.id}}};
    const site=randomUUID();await db.query("INSERT INTO portal_website_insights_sites(id,client_id,name,url,created_by) VALUES($1,501,'Job fixture','https://jobs.example.com',301)",[site]);
    await db.query("UPDATE portal_website_insights_reports SET created_at=NOW()-INTERVAL '2 minutes' WHERE client_id=501");
    async function clear() {
      hook=null;
      await db.query("UPDATE portal_website_insights_reports SET created_at=NOW()-INTERVAL '2 minutes' WHERE client_id=501");
      await db.query("DELETE FROM agency_platform.job_runs");
      await db.query("UPDATE portal_hubstaff_search_indexes SET lease_token=NULL,lease_until=NULL,next_attempt_at=NULL,checked_at=NULL");
      await db.query("UPDATE portal_prepared_source_indexes SET lease_token=NULL,lease_until=NULL,checked_at=NULL");
    }
    const claim=(kind,id,token=randomUUID(),manual=false,ctx=null)=>databasePool.query("SELECT * FROM agency_platform.claim_job($1,$2,$3,$4,$5,$6,$7)",
      [kind,String(id),ctx?.session.user.id||null,ctx?.session.session.id||null,ctx?.client.id||null,token,manual]);
    const finish=(kind,id,token,outcome="ok")=>databasePool.query("SELECT agency_platform.finish_job($1,$2,$3,$4)",[kind,String(id),token,outcome]);
    const denied=e=>["42501","job_scope_changed"].includes(e.code);
    await t.test("foreign jobs, forged client context, and direct ledger access deny before work",async()=>{
      await assert.rejects(worker.synchronizeHubstaffSearch("908"),denied);assert.equal(providerCalls,0);
      await assert.rejects(databasePool.query("SELECT * FROM agency_platform.job_runs"),{code:"42501"});
      const report=await store.startReport(context,site);
      assert.equal((await db.query("SELECT agency_id::text FROM agency_platform.job_runs WHERE kind='report' AND resource=$1",[report])).rows[0].agency_id,aoc,"Report ownership is registered at creation");
      const held=randomUUID();assert.equal((await claim("report",report,held,false,context)).rowCount,1);
      for(const other of [{...context,client:{id:"502"}},{...context,client:{id:"908"}},{...context,agency:{id:foreign}}])
        await assert.rejects(store.advanceReport(other,report,()=>assert.fail("No foreign Google call")),denied);
      await finish("report",report,held);
      await db.query("DELETE FROM portal_website_insights_reports WHERE id=$1",[report]);
    });
    await t.test("atomic capacity is shared across job kinds; replay and expired workers are fenced",async()=>{
      await clear();const report=await store.startReport(context,site),sourceToken=randomUUID();
      await db.query("INSERT INTO agency_platform.job_runs(kind,resource,agency_id,client_id,version,token,lease_until) VALUES('hubstaff','908',$1,908,'foreign',$2,NOW()+INTERVAL '1 minute')",[foreign,randomUUID()]);
      assert.equal((await claim("source",300,sourceToken)).rowCount,1);
      const reportToken=randomUUID();assert.equal((await claim("report",report,reportToken,false,context)).rowCount,1);
      const tokens=Array.from({length:5},()=>randomUUID());
      const admitted=await Promise.all(tokens.map((token,i)=>claim("hubstaff",901+i,token)));
      assert.equal(admitted.reduce((n,r)=>n+r.rowCount,0),3);
      assert.equal((await claim("source",300)).rowCount,0,"Same resource cannot run twice");
      assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.job_runs WHERE token IS NOT NULL AND agency_id=$1",[aoc])).rows[0].n,5);
      await assert.rejects(db.query("INSERT INTO agency_platform.job_runs(kind,resource,agency_id,client_id,version) VALUES('hubstaff','mismatch',$1,901,'invalid')",[foreign]),{code:"23503"});
      await db.query("UPDATE agency_platform.job_runs SET lease_until=NOW()-INTERVAL '1 second' WHERE kind='source'");
      const replacement=randomUUID();
      const restarted=spawnSync(process.execPath,["--input-type=module","-e",`
        import pg from 'pg';const db=new pg.Client({connectionString:process.env.DATABASE_URL});
        try {await db.connect();const r=await db.query("SELECT * FROM agency_platform.claim_job('source','300',NULL,NULL,NULL,$1,false)",[process.argv[1]]);
          if(r.rowCount!==1)process.exitCode=1;}finally{await db.end();}`,replacement],{encoding:"utf8",env:process.env});
      assert.equal(restarted.status,0,restarted.stdout+restarted.stderr);
      await assert.rejects(databasePool.query("SELECT agency_platform.check_job('source','300',$1,NULL,NULL,NULL)",[sourceToken]),{code:"42501"});
      await finish("source",300,sourceToken);
      assert.equal((await db.query("SELECT token::text FROM agency_platform.job_runs WHERE kind='source'")).rows[0].token,replacement);
      await db.query("DELETE FROM portal_website_insights_reports WHERE id=$1",[report]);
    });
    await t.test("automatic retry stops at five failures; explicit queue retry is authorized and fair",async()=>{
      await clear();
      for(let n=0;n<5;n++) {
        const token=randomUUID();assert.equal((await claim("hubstaff",901,token)).rowCount,1);await finish("hubstaff",901,token,"failed");
        await db.query("UPDATE agency_platform.job_runs SET next_attempt_at=NOW() WHERE resource='901'");
      }
      await assert.rejects(claim("hubstaff",901),{code:"55000"});
      let candidates=(await databasePool.query("SELECT * FROM agency_platform.job_candidates('hubstaff',100)")).rows.map(r=>r.resource);
      assert.ok(!candidates.includes("901")&&!candidates.includes("908"));
      await worker.queueHubstaffSearch("901");assert.equal((await db.query("SELECT failures FROM agency_platform.job_runs WHERE resource='901'")).rows[0].failures,0);
      candidates=(await databasePool.query("SELECT * FROM agency_platform.job_candidates('hubstaff',100)")).rows.map(r=>r.resource);
      assert.ok(candidates.includes("901"));assert.notEqual(candidates[0],"901","Unattempted resources get a turn before a repeated request");
    });
    await t.test("a reused database connection cannot carry a prior report workspace",async()=>{
      await clear();const report=await store.startReport(context,site),pooled=await databasePool.connect();
      try {
        await pooled.query("SELECT set_config('aoc.agency_id',$1,false)",[foreign]);
        await assert.rejects(pooled.query("SELECT * FROM agency_platform.job_scope('report',$1,$2,$3,502)",[report,sessionRow.external_id,sessionRow.id]),{code:"42501"});
        assert.equal((await pooled.query("SELECT * FROM agency_platform.job_scope('report',$1,$2,$3,501)",[report,sessionRow.external_id,sessionRow.id])).rows[0].agency_id,aoc);
      } finally {await pooled.query("RESET ALL");pooled.release();}
      await db.query("DELETE FROM portal_website_insights_reports WHERE id=$1",[report]);
    });
    await t.test("real Hubstaff batches deduplicate tasks and stop after suspension or changed mappings",async()=>{
      await clear();await worker.synchronizeHubstaffSearch("901",{taskPages:1,commentPages:1,manual:true});
      await clear();await worker.synchronizeHubstaffSearch("901",{taskPages:1,commentPages:1,manual:true});
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_hubstaff_search_tasks WHERE client_id=901 AND task_id=71")).rows[0].n,1);
      for(const change of [()=>db.query("UPDATE agency_platform.agencies SET is_active=false WHERE id=$1",[aoc]),
        ()=>db.query("UPDATE portal_clients SET portal_enabled=false WHERE id=902"),
        ()=>db.query("UPDATE portal_clients SET hubstaff_project_url='https://tasks.hubstaff.com/app/organizations/1/projects/999' WHERE id=902")]) {
        await clear();hook=change;await assert.rejects(worker.synchronizeHubstaffSearch("902",{manual:true}));
        assert.equal((await db.query("SELECT count(*)::int n FROM portal_hubstaff_search_tasks WHERE client_id=902")).rows[0].n,0);
        await db.query("UPDATE agency_platform.agencies SET is_active=true WHERE id=$1",[aoc]);
        await db.query("UPDATE portal_clients SET portal_enabled=true WHERE id=902");
        await db.query("UPDATE portal_clients SET hubstaff_project_url='https://tasks.hubstaff.com/app/organizations/1/projects/902' WHERE id=902");
      }
    });
    await t.test("source version changes and cancellation cannot commit prepared bytes",async()=>{
      await clear();await sources.synchronizePreparedSources("300");
      const before=(await db.query("SELECT encrypted_documents FROM portal_prepared_source_indexes WHERE owner_id=300")).rows[0].encrypted_documents;
      await clear();hook=()=>db.query("UPDATE agency_platform.connection_bindings SET generation=generation+1 WHERE service='drive' AND resource='300'");
      await assert.rejects(sources.synchronizePreparedSources("300"));
      assert.equal((await db.query("SELECT encrypted_documents FROM portal_prepared_source_indexes WHERE owner_id=300")).rows[0].encrypted_documents,before);
      assert.equal((await databasePool.query("SELECT * FROM agency_platform.source_approval(300,'clients',501,NULL)")).rowCount,0,"Prepared bytes must not approve a new publication revision");
      await clear();const controller=new AbortController();hook=()=>controller.abort();
      await assert.rejects(sources.synchronizePreparedSources("300",{signal:controller.signal}));
      assert.equal((await db.query("SELECT failures FROM agency_platform.job_runs WHERE kind='source'")).rows[0].failures,0);
      assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.job_runs WHERE token IS NOT NULL")).rows[0].n,0);
      await clear();const timeout=new AbortController();hook=()=>timeout.abort(new DOMException("Synthetic timeout","TimeoutError"));
      await assert.rejects(sources.synchronizePreparedSources("300",{signal:timeout.signal}));
      assert.equal((await db.query("SELECT failures FROM agency_platform.job_runs WHERE kind='source'")).rows[0].failures,1);
    });
    await t.test("revoked provider fixtures cannot publish and cancellation permits a clean resume",async()=>{
      await clear();hook=()=>{throw {publicDetails:{httpStatus:403}};};
      await assert.rejects(worker.synchronizeHubstaffSearch("903",{manual:true}));
      assert.equal((await db.query("SELECT failure_code FROM portal_hubstaff_search_indexes WHERE client_id=903")).rows[0].failure_code,"access_denied");
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_hubstaff_search_tasks WHERE client_id=903")).rows[0].n,0);
      await clear();await worker.synchronizeHubstaffSearch("903",{taskPages:1,commentPages:1,manual:true});
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_hubstaff_search_tasks WHERE client_id=903")).rows[0].n,1);
    });
    await t.test("reports recheck membership, suspension and connection generation before commit and delivery",async()=>{
      await clear();const report=await store.startReport(context,site);
      await db.query("UPDATE portal_website_insights_reports SET state=jsonb_set(state,'{stage}','\"search\"') WHERE id=$1",[report]);
      for(const change of [()=>db.query("UPDATE portal_memberships SET is_active=false WHERE user_id=301 AND client_id=501"),
        ()=>db.query("UPDATE portal_memberships SET role='client_viewer' WHERE user_id=301 AND client_id=501"),
        ()=>db.query('UPDATE "session" SET "expiresAt"=NOW()-INTERVAL \'1 second\' WHERE id=$1',[sessionRow.id]),
        ()=>db.query("UPDATE agency_platform.agencies SET is_active=false WHERE id=$1",[aoc]),
        ()=>db.query("INSERT INTO agency_platform.connection_bindings(service,resource,agency_id,client_id) VALUES('search_console',$1,$2,501) ON CONFLICT(service,resource) DO UPDATE SET generation=agency_platform.connection_bindings.generation+1",[site,aoc])]) {
        await clear();await assert.rejects(store.advanceReport(context,report,async()=>{await change();return {status:"ready",canary:"must-not-save"};},undefined,true));
        const saved=(await db.query("SELECT status,result FROM portal_website_insights_reports WHERE id=$1",[report])).rows[0];
        assert.equal(saved.status,"running");assert.ok(!JSON.stringify(saved.result).includes("must-not-save"));
        await db.query("UPDATE portal_memberships SET is_active=true,role='client_admin' WHERE user_id=301 AND client_id=501");
        await db.query('UPDATE "session" SET "expiresAt"=NOW()+INTERVAL \'1 hour\' WHERE id=$1',[sessionRow.id]);
        await db.query("UPDATE agency_platform.agencies SET is_active=true WHERE id=$1",[aoc]);
      }
      await clear();const result=await store.advanceReport(context,report,async()=>({status:"not_connected"}),undefined,true);
      assert.equal(result.status,"complete");
      let calls=0;await store.advanceReport(context,report,async()=>{calls++;},undefined,true);assert.equal(calls,0);
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_website_insights_reports WHERE id=$1",[report])).rows[0].n,1);
      await assert.rejects(jobs.runBackgroundJob("report",report,{context:{...context,client:{id:"502"}}},()=>assert.fail("No foreign output")),denied);
    });
  } finally { await databasePool.end();await db.end(); }
});
