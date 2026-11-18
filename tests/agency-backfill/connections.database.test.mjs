import {test} from "node:test";
import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {OAuth2Client} from "google-auth-library";

test("Stage 09 connection ownership, OAuth and refresh races", {skip:!process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL},async t=>{
  const url=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL),app=new URL(process.env.DATABASE_URL);
  assert.equal(url.hostname,"127.0.0.1");
  assert.match(url.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);
  assert.equal(url.host,app.host);assert.equal(url.pathname,app.pathname);
  const db=new pg.Client({connectionString:url.href});await db.connect();
  const {databasePool}=await import("../../lib/database.js");
  try {
    assert.equal((await db.query("SELECT current_database() name")).rows[0].name,url.pathname.slice(1));
    assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.schema_migrations WHERE version='005_source_boundaries'")).rows[0].n,1);
    await db.query("UPDATE portal_source_publications SET enabled=true WHERE owner_id=300 AND audience='clients'");
    await db.query("UPDATE portal_prepared_source_indexes SET failure_code=NULL,checked_at=NOW() WHERE owner_id=300");
    const before = (await db.query("SELECT to_jsonb(c) value FROM portal_drive_source_connections c ORDER BY owner_id")).rows;
    assert.equal((await databasePool.query("SELECT * FROM agency_platform.source_approval(300,'clients',501,NULL)")).rowCount,1);
    for(let i=0;i<2;i++) {
      const migrated=spawnSync(process.execPath,["scripts/migrate-agency-connections.mjs","--confirm-database",url.pathname.slice(1),"--app-role",app.username],
        {encoding:"utf8",env:process.env});
      assert.equal(migrated.status,0,migrated.stdout+migrated.stderr);
    }
    assert.ok(JSON.stringify((await db.query("SELECT to_jsonb(c) value FROM portal_drive_source_connections c ORDER BY owner_id")).rows) === JSON.stringify(before),
      "Migration must preserve the existing credential rows.");
    assert.equal((await databasePool.query("SELECT * FROM agency_platform.source_approval(300,'clients',501,NULL)")).rowCount,1);
    const aoc=(await db.query("SELECT aoc_agency_id::text id FROM agency_platform.backfill_state")).rows[0].id;
    async function session(id) {
      const {rows}=await db.query('SELECT p.external_id,s.id FROM portal_users p JOIN "session" s ON s."userId"=p.external_id WHERE p.id=$1 ORDER BY s."createdAt" DESC LIMIT 1',[id]);
      assert.ok(rows[0]);
      return {user:{id:rows[0].external_id},session:{id:rows[0].id}};
    }
    const clientSession=await session(301),adminSession=await session(300);
    const context={client:{id:"501"},user:{id:"301"},agency:{id:aoc},session:clientSession};
    const site=randomUUID(),foreignSite=randomUUID(),siblingSite=randomUUID();
    for(const [id,client] of [[site,501],[siblingSite,502],[foreignSite,801]])
      await db.query("INSERT INTO portal_website_insights_sites(id,client_id,name,url,created_by) VALUES($1,$2,'Synthetic site','https://connections.example.com',301)",[id,client]);
    Object.assign(process.env,{WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID:"fixture.apps.googleusercontent.com",WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET:"fixture-only",
      WEBSITE_INSIGHTS_ENCRYPTION_KEY:"fixture-search-secret-at-least-32-characters",
      GOOGLE_DRIVE_CLIENT_ID:"fixture.apps.googleusercontent.com",GOOGLE_DRIVE_CLIENT_SECRET:"fixture-only",
      GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY:"fixture-drive-secret-at-least-32-characters",
      GOOGLE_DRIVE_ALLOWED_EMAIL:"fixture@example.invalid",GOOGLE_DRIVE_ROOT_FOLDER_ID:"fixture_root_12345"});
    const google=await import("../../lib/website-insights/google.js");
    const drive=await import("../../lib/drive-source-service.js");
    const {integrationScope,commitIntegration,sameIntegration}=await import("../../lib/integration-ownership.js");
    let exchange=0,fetches=0,revoke=0;
    let tokenHook=null,refreshHook=null;
    t.mock.method(OAuth2Client.prototype,"getToken",async()=>{
      exchange++;
      if(tokenHook)await tokenHook();
      return {tokens:{refresh_token:"synthetic-refresh",access_token:"synthetic-access",id_token:"synthetic-id",
        scope:"https://www.googleapis.com/auth/webmasters.readonly https://www.googleapis.com/auth/drive.readonly"}};
    });
    t.mock.method(OAuth2Client.prototype,"getAccessToken",async()=>{
      if(refreshHook)await refreshHook();
      return {token:"synthetic-access"};
    });
    t.mock.method(OAuth2Client.prototype,"request",async()=>({data:{siteEntry:[{siteUrl:"https://connections.example.com/",permissionLevel:"siteOwner"}]}}));
    t.mock.method(OAuth2Client.prototype,"verifyIdToken",async()=>({getPayload:()=>({sub:"synthetic",email:"fixture@example.invalid",email_verified:true})}));
    t.mock.method(OAuth2Client.prototype,"revokeToken",async()=>{revoke++;});
    t.mock.method(globalThis,"fetch",async value=>{
      const target=new URL(value);assert.equal(target.origin,"https://www.googleapis.com");fetches++;
      if(target.pathname.startsWith("/drive/v3/files/"))return Response.json({id:"fixture_root_12345",name:"Fixture root",mimeType:"application/vnd.google-apps.folder"});
      return Response.json({siteEntry:[{siteUrl:"https://connections.example.com/",permissionLevel:"siteOwner"}]});
    });
    const denied=e=>["42501","connection_scope_changed","oauth_state","invalid_oauth_state"].includes(e.code || e.publicDetails?.code);
    await t.test("foreign and same-agency client states cannot attach credentials",async()=>{
      const attempt=await google.beginGoogle(context,site);
      for(const clientId of ["502","801"]) {
        const other={...context,client:{id:clientId}};
        await assert.rejects(google.finishGoogle(other,attempt.state,attempt.state,"synthetic-code"));
      }
      assert.equal(exchange,0);
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_website_insights_google WHERE website_id=$1",[site])).rows[0].n,0);
      await google.finishGoogle(context,attempt.state,attempt.state,"synthetic-code");
      await assert.rejects(google.finishGoogle(context,attempt.state,attempt.state,"replay"));
      const saved=(await db.query("SELECT * FROM portal_website_insights_google WHERE website_id=$1",[site])).rows[0];
      assert.ok(!JSON.stringify(saved).includes("synthetic-refresh"));
      assert.equal(saved.client_id,"501");
      const properties=await google.googleProperties(context,site);assert.equal(properties.length,1);
      await assert.rejects(google.selectGoogleProperty(context,site,"https://foreign.example/"));
      await google.selectGoogleProperty(context,site,"https://connections.example.com/");
    });
    await t.test("a pending callback cannot restore a disconnected connection",async()=>{
      const attempt=await google.beginGoogle(context,site);
      tokenHook=()=>google.disconnectGoogle(context,site);
      try {await assert.rejects(google.finishGoogle(context,attempt.state,attempt.state,"synthetic-code"),denied);}
      finally {tokenHook=null;}
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_website_insights_google WHERE website_id=$1",[site])).rows[0].n,0);
    });
    await t.test("stale refresh and racing callbacks cannot overwrite or deliver from a replacement",async()=>{
      let attempt=await google.beginGoogle(context,site);
      await google.finishGoogle(context,attempt.state,attempt.state,"synthetic-code");
      const before=fetches;
      refreshHook=()=>google.disconnectGoogle(context,site);
      try {await assert.rejects(google.googleProperties(context,site),denied);}
      finally {refreshHook=null;}
      assert.equal(fetches,before);
      const fence=await integrationScope(clientSession,"search_console",site,null,"501");
      await commitIntegration(fence,clientSession,async()=>{});
      let writes=0;
      await assert.rejects(commitIntegration(fence,clientSession,async()=>{writes++;}),denied);
      assert.equal(writes,0);
      await assert.rejects(integrationScope(clientSession,"search_console",siblingSite,null,"502"),denied);
      await assert.rejects(integrationScope(clientSession,"search_console",foreignSite,null,"801"),denied);
      assert.throws(()=>sameIntegration({agency_id:"another",generation:fence.generation},fence));
      await assert.rejects(databasePool.query("SELECT * FROM agency_platform.connection_bindings"),{code:"42501"});
    });
    await t.test("role revocation during exchange prevents credential and property writes",async()=>{
      const attempt=await google.beginGoogle(context,site);
      tokenHook=()=>db.query("UPDATE portal_memberships SET role='client_viewer' WHERE client_id=501 AND user_id=301");
      try {await assert.rejects(google.finishGoogle(context,attempt.state,attempt.state,"synthetic-code"),denied);}
      finally {
        tokenHook=null;
        await db.query("UPDATE portal_memberships SET role='client_admin' WHERE client_id=501 AND user_id=301");
      }
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_website_insights_google WHERE website_id=$1",[site])).rows[0].n,0);
    });
    await t.test("Drive stays AOC-private, reconnect invalidates old grants and Stage 08 approval",async()=>{
      await assert.rejects(drive.beginDriveConnection(300,adminSession),denied);
      await assert.rejects(drive.beginDriveConnection(300,clientSession),denied);
      // Last phase changes only this disposable fixture back to an all-AOC estate.
      await db.query("DELETE FROM agency_platform.connection_bindings WHERE client_id=801");
      await db.query("DELETE FROM agency_platform.source_revision_approvals WHERE client_id=801");
      await db.query("DELETE FROM portal_source_publications WHERE client_id=801");
      await db.query("DELETE FROM agency_platform.legacy_ownership WHERE client_id=801");
      await db.query("DELETE FROM agency_platform.client_ownership WHERE client_id=801");
      await db.query("DELETE FROM portal_clients WHERE id=801");
      const attempt=await drive.beginDriveConnection(300,adminSession);
      await drive.finishDriveConnection(300,adminSession,attempt.state,attempt.state,"synthetic-code");
      const approval=await databasePool.query("SELECT * FROM agency_platform.source_approval(300,'clients',501,NULL)");
      assert.equal(approval.rowCount,0,"Reconnect must not silently approve a new source connection.");
      const before=fetches;
      refreshHook=()=>drive.disconnectDriveSource(300,adminSession);
      try {await assert.rejects(drive.discoverConnectedSources(300),denied);}
      finally {refreshHook=null;}
      assert.equal(fetches,before,"A stale refresh must stop before a Drive file read.");
      const racing=await drive.beginDriveConnection(300,adminSession);
      tokenHook=()=>drive.disconnectDriveSource(300,adminSession);
      try {await assert.rejects(drive.finishDriveConnection(300,adminSession,racing.state,racing.state,"synthetic-code"),denied);}
      finally {tokenHook=null;}
      const stale=await drive.beginDriveConnection(300,adminSession);
      await drive.disconnectDriveSource(300,adminSession);
      await assert.rejects(drive.finishDriveConnection(300,adminSession,stale.state,stale.state,"synthetic-code"),denied);
      assert.equal((await db.query("SELECT count(*)::int n FROM portal_drive_source_connections WHERE owner_id=300")).rows[0].n,0);
      assert.equal(revoke,0,"Local disconnect cannot revoke another use of the OAuth app.");
    });
  } finally {await databasePool.end();await db.end();}
});
