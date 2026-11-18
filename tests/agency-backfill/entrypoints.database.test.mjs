import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import pg from "pg";

// All writes require the same explicit disposable loopback fixture as Stage 05.
test("Stage 06 existing entry points keep four clients isolated", {skip:!process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL}, async t => {
  const owner = new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL);
  const runtime = new URL(process.env.DATABASE_URL);
  assert.equal(owner.hostname,"127.0.0.1");
  assert.match(owner.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);
  assert.equal(runtime.host,owner.host); assert.equal(runtime.pathname,owner.pathname);
  assert.match(runtime.username,/^aoc_s04_legacy_[a-f0-9]+$/);
  const origin=process.env.BETTER_AUTH_URL;
  assert.equal(new URL(origin).hostname,"127.0.0.1");
  const db=new pg.Client({connectionString:owner.href}); await db.connect();
  const {createPortalAuth,closeAuthDatabase}=await import("../../lib/auth.js");
  const {databasePool}=await import("../../lib/database.js");
  try {
    assert.equal((await db.query("SELECT current_database() name")).rows[0].name,owner.pathname.slice(1));
    assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.backfill_state WHERE active")).rows[0].n,1);
    await db.query(await readFile(new URL("../../database/internal-user-schema.sql",import.meta.url),"utf8"));
    await db.query('GRANT SELECT ON portal_internal_users TO "'+runtime.username+'"');
    const authTables=(await db.query("SELECT quote_ident(tablename) name FROM pg_tables WHERE schemaname='public' AND tablename IN ('user','account','session','verification','rateLimit')")).rows;
    assert.ok(authTables.length>=4,"Run the Better Auth migration on the disposable fixture first.");
    for(const table of authTables) await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON public.'+table.name+' TO "'+runtime.username+'"');
    const aoc=(await db.query("SELECT aoc_agency_id::text id FROM agency_platform.backfill_state")).rows[0].id;
    const harbor=(await db.query("SELECT id::text FROM agency_platform.agencies WHERE slug='harbor-fixture'")).rows[0].id;
    await db.query("INSERT INTO portal_clients(id,slug,display_name) VALUES(602,'s06-cedar','Cedar Harbor')");
    await db.query("INSERT INTO agency_platform.client_ownership(agency_id,client_id) VALUES($1,602)",[harbor]);
    // Remove prior test grants. Every identity below has exactly one client.
    await db.query("DELETE FROM portal_memberships WHERE user_id=301 AND client_id<>501");
    await db.query("DELETE FROM agency_platform.client_access WHERE user_id=301 AND client_id<>501");
    await db.query("DELETE FROM agency_platform.memberships WHERE user_id=301 AND agency_id<>$1",[aoc]);
    await db.query("UPDATE portal_memberships SET role='client_admin',is_active=true WHERE client_id=501 AND user_id=301");
    const provisioning=createPortalAuth({allowAccountCreation:true,useNextCookies:false});
    const identities=[];
    for (const [user,client,agency,slug] of [[301,501,aoc,"s04-orchid"],[305,502,aoc,"s04-birch"],[302,601,harbor,"s04-pine"],[306,602,harbor,"s06-cedar"]]) {
      const username="stage06.u"+user,password=randomBytes(24).toString("hex");
      const signed=await provisioning.api.signUpEmail({body:{username,password,name:username,email:username+"@example.invalid"}});
      await db.query("INSERT INTO portal_users(id,external_id,display_name) VALUES($1,$2,$3) ON CONFLICT(id) DO UPDATE SET external_id=EXCLUDED.external_id",[user,signed.user.id,username]);
      await db.query("INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES($1,$2,'client_admin',true) ON CONFLICT(client_id,user_id) DO UPDATE SET role='client_admin',is_active=true",[client,user]);
      await db.query("INSERT INTO agency_platform.memberships(agency_id,user_id,role) VALUES($1,$2,'client_user') ON CONFLICT(agency_id,user_id) DO UPDATE SET is_active=true",[agency,user]);
      await db.query("INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level) VALUES($1,$2,$3,'manage') ON CONFLICT(agency_id,client_id,user_id) DO UPDATE SET is_active=true,access_level='manage'",[agency,client,user]);
      const login=await provisioning.api.signInUsername({body:{username,password},headers:new Headers({origin}),asResponse:true});
      assert.equal(login.status,200);
      const result=await login.json();
      const cookie=login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
      const session=(await db.query('SELECT id FROM "session" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',[signed.user.id])).rows[0].id;
      identities.push({user:String(user),client:String(client),agency,slug,session,external:signed.user.id,
        headers:new Headers({host:new URL(origin).host,origin,"content-type":"application/json",cookie:cookie+"; aoc_active_client="+slug+"; aoc_active_agency="+(agency===aoc?"aoc":"harbor-fixture")})});
      assert.ok(result.user);
    }
    const actor=identities[0];
    const portal=await import("../../lib/portal-data.js");
    const library=await import("../../app/api/client-library/route.js");
    const files=await import("../../app/api/client-library/[id]/route.js");
    const generated=await import("../../app/api/assistant-files/[id]/route.js");
    const insights=await import("../../app/api/client/website-insights/route.js");
    const conversations=await import("../../app/api/conversations/route.js");
    const members=await import("../../app/api/client/members/route.js");
    const resources=[];
    for(const identity of identities) {
      const file="lib_"+randomBytes(16).toString("hex"),artifact=randomUUID(),site=randomUUID(),report=randomUUID();
      const thread="thr_"+randomBytes(16).toString("hex");
      const marker="private-client-"+identity.client;
      await db.query("INSERT INTO portal_client_library(id,client_id,submitted_by,source_type,title,filename,mime_type,content) VALUES($1,$2,$3,'file',$4,'fixture.txt','text/plain',$5)",[file,identity.client,identity.user,marker,Buffer.from(marker)]);
      await db.query("INSERT INTO portal_assistant_files(id,client_id,user_id,filename,mime_type,content) VALUES($1,$2,$3,'fixture.webp','image/webp',$4)",[artifact,identity.client,identity.user,Buffer.from(marker)]);
      await db.query("INSERT INTO portal_website_insights_sites(id,client_id,name,url,created_by) VALUES($1,$2,$3,'https://example.com',$4)",[site,identity.client,marker,identity.user]);
      await db.query("INSERT INTO portal_website_insights_reports(id,website_id,client_id,started_by,status,state,result) VALUES($1,$2,$3,$4,'complete','{\"stage\":\"complete\"}',$5::jsonb)",[report,site,identity.client,identity.user,JSON.stringify({root:"https://example.com",findings:[{title:marker}],summary:{}})]);
      await db.query("INSERT INTO portal_chatkit_threads(client_id,user_id,id,data,chat_mode) VALUES($1,$2,$3,$4::jsonb,'work')",[identity.client,identity.user,thread,JSON.stringify({id:thread,title:marker,created_at:new Date().toISOString(),status:{type:"active"}})]);
      resources.push({file,artifact,site,report,thread,marker});
    }
    function request(path,identity=actor,method="GET",body) {
      return new Request(origin+path,{method,headers:identity.headers,...(body?{body:JSON.stringify(body)}:{})});
    }
    await t.test("all four identities deny unassigned clients in either agency",async()=>{
      for(const identity of identities) {
        for(const target of identities.filter(x=>x!==identity)) {
          const h=new Headers(identity.headers);h.set("x-client-id",target.client);h.set("x-agency-id",target.agency);
          await assert.rejects(portal.resolvePortalContext(h),e=>e.publicDetails?.status===403);
        }
        if(identity.agency===aoc) assert.equal((await portal.resolvePortalContext(identity.headers)).client.id,identity.client);
        else await assert.rejects(portal.resolvePortalContext(identity.headers),e=>e.publicDetails?.code==="agency_client_gated");
      }
    });
    await t.test("customer and agency roles cannot enter platform or Internal operations",async()=>{
      const routes = [
        ["../../app/api/admin/client-operations/route.js","GET"],
        ["../../app/api/admin/credits/route.js","GET"],
        ["../../app/api/admin/provider-settings/route.js","GET"],
        ["../../app/api/builder/route.js","GET"],
        ["../../app/api/admin/make/test/route.js","POST"],
        ["../../app/api/internal/hr/route.js","GET"],
        ["../../app/api/internal/project-management/route.js","GET"],
      ];
      for(const identity of identities) {
        for(const [path,method] of routes) {
          const endpoint=await import(path);
          const response=await endpoint[method](request("/api/check",identity,method));
          assert.equal(response.status,403,path);
        }
      }
    });
    await t.test("lists, downloads, JSON and CSV exports hide foreign records",async()=>{
      for(const identity of identities.slice(0,2)) {
        const listing=await (await library.GET(request("/api/client-library",identity))).json();
        for(const [index,target] of identities.entries()) {
          const resource=resources[index],own=target===identity;
          assert.equal(listing.items.some(x=>x.title===resource.marker),own);
          const download=await files.GET(request("/api/client-library/"+resource.file,identity),{params:Promise.resolve({id:resource.file})});
          assert.equal(download.status,own?200:404);
          const artifact=await generated.GET(request("/api/assistant-files/"+resource.artifact,identity),{params:Promise.resolve({id:resource.artifact})});
          assert.equal(artifact.status,own?200:404);
          for(const format of ["json","csv"]) {
            const response=await insights.GET(request("/api/client/website-insights?report="+resource.report+"&download="+format,identity));
            assert.equal(response.status,own?200:404);
            if(!own) assert.ok(!(await response.text()).includes(resource.marker));
          }
        }
      }
    });
    await t.test("denied writes and ownership reassignment leave rows intact",async()=>{
      const before=(await db.query("SELECT id,title,client_id FROM portal_client_library ORDER BY id")).rows;
      for(const [i,target] of identities.entries()) {
        if(i===0)continue;
        assert.equal((await library.DELETE(request("/api/client-library",actor,"DELETE",{id:resources[i].file}))).status,404);
        assert.equal((await insights.POST(request("/api/client/website-insights",actor,"POST",{action:"rename",site:resources[i].site,name:"changed"}))).status,404);
        assert.equal((await members.PATCH(request("/api/client/members",actor,"PATCH",{id:target.user,action:"deactivate"}))).status,404);
        assert.equal((await conversations.DELETE(request("/api/conversations",actor,"DELETE",{id:resources[i].thread}))).status,404);
      }
      assert.deepEqual((await db.query("SELECT id,title,client_id FROM portal_client_library ORDER BY id")).rows,before);
      for(const field of ["agencyId","clientId","owner_id","priceOverride","billingReference"]) {
        const response=await library.POST(request("/api/client-library",actor,"POST",{title:"bad",url:"https://example.com",[field]:"forged"}));
        assert.equal(response.status,400);
      }
      const elevated=await members.POST(request("/api/client/members",actor,"POST",{username:"stage06.elevated",name:"Rejected account",password:"Synthetic#Password123",role:"client_admin"}));
      assert.equal(elevated.status,400);
      assert.deepEqual((await db.query("SELECT id,title,client_id FROM portal_client_library ORDER BY id")).rows,before);
    });
    await t.test("Next.js signs its verified scope and stops foreign threads before forwarding",async()=>{
      const chat=await import("../../app/api/chatkit/route.js");
      const {createHmac}=await import("node:crypto");
      const original=globalThis.fetch;
      const oldUrl=process.env.CHATKIT_BACKEND_URL,oldSecret=process.env.CHATKIT_BACKEND_SECRET;
      process.env.CHATKIT_BACKEND_URL="http://127.0.0.1:1";
      process.env.CHATKIT_BACKEND_SECRET=randomBytes(32).toString("hex");
      let forwarded=0;
      globalThis.fetch=async(url,options)=>{
        assert.equal(new URL(url).host,"127.0.0.1:1");
        forwarded++;
        const envelope=JSON.parse(options.body);
        assert.equal(envelope.client_id,actor.client);
        assert.equal(envelope.agency_id,actor.agency);
        assert.equal(envelope.user_id,actor.user);
        assert.equal(envelope.auth_session_id,actor.session);
        const signature=createHmac("sha256",process.env.CHATKIT_BACKEND_SECRET)
          .update(options.headers["x-chatkit-timestamp"]+"."+options.body).digest("hex");
        assert.equal(options.headers["x-chatkit-signature"],signature);
        return Response.json({thread:{id:resources[0].thread}});
      };
      try {
        const h=new Headers(actor.headers);h.set("x-aoc-client",actor.client);
        for(const [i,resource] of resources.entries()) {
          const response=await chat.POST(new Request(origin+"/api/chatkit",{method:"POST",headers:h,
            body:JSON.stringify({type:"threads.get_by_id",params:{thread_id:resource.thread},client_id:"601"})}));
          assert.equal(response.status,i===0?200:404);
        }
        assert.equal(forwarded,1);
      } finally {
        globalThis.fetch=original;
        if(oldUrl===undefined)delete process.env.CHATKIT_BACKEND_URL;else process.env.CHATKIT_BACKEND_URL=oldUrl;
        if(oldSecret===undefined)delete process.env.CHATKIT_BACKEND_SECRET;else process.env.CHATKIT_BACKEND_SECRET=oldSecret;
      }
    });
    await t.test("client roles, legacy membership trigger and stale-document checks",async()=>{
      const added=await library.POST(request("/api/client-library",actor,"POST",{title:"Scoped link",url:"https://example.com"}));
      assert.equal(added.status,201);
      const member=await members.POST(request("/api/client/members",actor,"POST",{username:"stage06.created",name:"Created fixture",password:randomBytes(24).toString("hex")+"Aa!",role:"member"}));
      assert.equal(member.status,201, member.status===201 ? "" : await member.text());
      const created=(await member.json()).member;
      const grant=await db.query("SELECT * FROM agency_platform.request_workspaces((SELECT external_id FROM portal_users WHERE id=$1))",[created.id]);
      assert.equal(grant.rowCount,1);assert.equal(String(grant.rows[0].client_id),actor.client);
      for(const role of ["client_viewer","member","client_admin"]) {
        await db.query("UPDATE portal_memberships SET role=$1 WHERE client_id=501 AND user_id=301",[role]);
        assert.equal((await members.GET(request("/api/client/members"))).status,role==="client_admin"?200:403);
        const write=await library.POST(request("/api/client-library",actor,"POST",{title:"Role link",url:"https://example.com"}));
        assert.equal(write.status,role==="client_viewer"?403:201);
      }
      const stale=new Headers(actor.headers);stale.set("x-aoc-client","502");
      await assert.rejects(portal.resolvePortalContext(stale),e=>e.publicDetails?.status===409);
    });
    await t.test("Python signed endpoint independently checks the same sessions and resources",async()=>{
      const executable=process.env.STAGE06_PYTHON || ".venv/Scripts/python.exe";
      const env={...process.env,STAGE06_ACTORS:JSON.stringify(identities.map(({headers,...id})=>id)),CHATKIT_BACKEND_SECRET:randomBytes(32).toString("hex")};
      const result=await new Promise((resolve,reject)=>{
        const child=spawn(executable,["-m","unittest","discover","-s","chatkit_backend/tests","-p","test_stage06_database.py"],{env,windowsHide:true});
        let output="";child.stdout.on("data",c=>output+=c);child.stderr.on("data",c=>output+=c);
        child.on("error",reject);child.on("close",code=>resolve({code,output}));
      });
      assert.equal(result.code,0,result.output);
    });
    await t.test("Hubstaff service selection excludes foreign clients before batching",async sub=>{
      await db.query("UPDATE portal_clients SET hubstaff_project_url='https://tasks.hubstaff.com/app/organizations/1/projects/'||id::text WHERE id IN (501,502,601,602)");
      const worker=await import("../../lib/hubstaff-search-sync.js");
      sub.mock.method(globalThis,"fetch",()=>assert.fail("Authorization tests cannot call Hubstaff"));
      if (!(await db.query("SELECT to_regprocedure('agency_platform.job_scope(text,text,text,text,bigint)') installed")).rows[0].installed) {
        for (const identity of identities.slice(2)) await assert.rejects(worker.queueHubstaffSearch(identity.client),{code:"42883"});
        await assert.rejects(worker.synchronizeAllHubstaffSearch(),{code:"42883"});
        return; // Adopted, partially migrated installations must fail closed. Stage 10 tests positive execution.
      }
      for(const identity of identities.slice(2)) {
        const queued=await worker.queueHubstaffSearch(identity.client);
        assert.equal(queued.skipped,true);
      }
      const query=databasePool.query.bind(databasePool);
      let selected;
      sub.mock.method(databasePool,"query",async(sql,...args)=>{
        const result=await query(sql,...args);
        if(typeof sql==="string" && sql.includes("SELECT p.id FROM")) selected=result.rows.map(r=>String(r.id));
        return result;
      });
      const controller=new AbortController();controller.abort();
      await worker.synchronizeAllHubstaffSearch({signal:controller.signal,maxClients:4});
      assert.deepEqual(selected,["501","502"]);
    });
    await t.test("Stage 07 copied URLs, switched workspaces and warmed cache require live access",async()=>{
      const {inWorkspaceCache,workspaceCacheKey}=await import("../../lib/workspace-cache.js");
      const cache=new Map();
      async function cachedRead(identity) {
        const context=await portal.resolvePortalContext(identity.headers);
        return inWorkspaceCache(context.workspaceKey,()=>{
          const key=workspaceCacheKey("same-file-reference");
          if(!cache.has(key)) cache.set(key, "client-"+context.client.id);
          return cache.get(key);
        });
      }
      assert.equal(await cachedRead(actor),"client-501");
      assert.equal(await cachedRead(identities[1]),"client-502");
      const own=resources[0],path="/api/client-library/"+own.file;
      const allowed=await files.GET(request(path),{params:Promise.resolve({id:own.file})});
      assert.equal(allowed.status,200);
      assert.equal(allowed.headers.get("cache-control"),"private, no-store");
      assert.equal(allowed.headers.get("vary"),"Cookie");
      assert.match(allowed.headers.get("content-security-policy"),/sandbox/);
      const anonymous=new Request(origin+path,{headers:{host:new URL(origin).host}});
      assert.equal((await files.GET(anonymous,{params:Promise.resolve({id:own.file})})).status,401);
      // This user can explicitly switch to a second assigned workspace.
      await db.query("INSERT INTO portal_memberships(client_id,user_id,role) VALUES(502,301,'member')");
      const h=new Headers(actor.headers);
      h.set("cookie",h.get("cookie").replace("s04-orchid","s04-birch"));
      assert.equal((await files.GET(new Request(origin+path,{headers:h}),{params:Promise.resolve({id:own.file})})).status,404);
      const oldTab=new Headers(h);oldTab.set("x-aoc-client","501");
      await assert.rejects(portal.resolvePortalContext(oldTab),e=>e.publicDetails?.status===409);
      await db.query("DELETE FROM portal_memberships WHERE client_id=502 AND user_id=301");
      await db.query("INSERT INTO portal_memberships(client_id,user_id,role) VALUES(501,305,'member')");
      const teammate=new Headers(identities[1].headers);
      teammate.set("cookie",teammate.get("cookie").replace("s04-birch","s04-orchid"));
      assert.equal((await files.GET(new Request(origin+path,{headers:teammate}),{params:Promise.resolve({id:own.file})})).status,200);
      assert.equal((await generated.GET(new Request(origin+"/api/assistant-files/"+own.artifact,{headers:teammate}),{params:Promise.resolve({id:own.artifact})})).status,404);
      await db.query("DELETE FROM portal_memberships WHERE client_id=501 AND user_id=305");
      await db.query("UPDATE portal_memberships SET is_active=false WHERE client_id=501 AND user_id=301");
      try {
        assert.equal((await files.GET(request(path),{params:Promise.resolve({id:own.file})})).status,403);
        assert.equal((await generated.GET(request("/api/assistant-files/"+own.artifact),{params:Promise.resolve({id:own.artifact})})).status,403);
        await assert.rejects(cachedRead(actor),e=>e.publicDetails?.status===403);
      } finally {await db.query("UPDATE portal_memberships SET is_active=true WHERE client_id=501 AND user_id=301");}
      await db.query("UPDATE portal_assistant_files SET preview=true,created_at=now()-interval '25 hours' WHERE id=$1",[own.artifact]);
      assert.equal((await generated.GET(request("/api/assistant-files/"+own.artifact),{params:Promise.resolve({id:own.artifact})})).status,404);
    });
    await t.test("legacy Admin creation assigns AOC ownership atomically and cannot adopt old records",async()=>{
      const platform=await import("../../lib/admin-data.js");
      const username="stage06.operator",password=randomBytes(24).toString("hex")+"Aa!";
      const account=await provisioning.api.signUpEmail({body:{username,password,name:username,email:username+"@example.invalid"}});
      await db.query("UPDATE portal_users SET external_id=$1 WHERE id=300",[account.user.id]);
      const login=await provisioning.api.signInUsername({body:{username,password},headers:new Headers({origin}),asResponse:true});
      assert.equal(login.status,200);
      const headers=new Headers({host:new URL(origin).host,origin,cookie:login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ")});
      await assert.rejects(platform.resolveAdminContext(headers),e=>e.publicDetails?.status===403);
      await assert.rejects(databasePool.query("SELECT agency_platform.adopt_new_aoc_client($1,701)",[account.user.id]),{code:"42501"});
      // This last scenario changes only this run's synthetic estate to all AOC.
      await db.query("DELETE FROM agency_platform.legacy_ownership WHERE client_id IN (601,602,701)");
      await db.query("DELETE FROM agency_platform.client_access WHERE client_id IN (601,602,701)");
      await db.query("DELETE FROM agency_platform.resources WHERE client_id IN (601,602,701)");
      await db.query("DELETE FROM agency_platform.client_ownership WHERE client_id IN (601,602,701)");
      await db.query("DELETE FROM portal_clients WHERE id IN (601,602,701)");
      const created=await platform.createAdminClient({username:"stage06.newclient",name:"New AOC fixture",password:randomBytes(24).toString("hex")+"Aa!",
        agencyId:harbor,role:"platform_admin",ownerId:"306"},headers);
      assert.ok(created);
      const ownership=await db.query("SELECT agency_id::text id FROM agency_platform.client_ownership WHERE client_id=$1",[created.id]);
      assert.equal(ownership.rows[0].id,aoc);
      const grant=await db.query("SELECT * FROM agency_platform.request_workspaces((SELECT external_id FROM portal_users WHERE id=(SELECT user_id FROM portal_memberships WHERE client_id=$1)))",[created.id]);
      assert.equal(grant.rowCount,1);assert.equal(grant.rows[0].client_role,"client_admin");
      assert.equal((await platform.resolveAdminContext(headers)).admin.id,"300");
      const preview=randomUUID();
      await db.query("INSERT INTO portal_assistant_files(id,client_id,user_id,preview,filename,mime_type,content,created_at) VALUES($1,501,300,true,'../../preview.webp','image/webp',$2,now()-interval '23 hours')",[preview,Buffer.from("synthetic-preview")]);
      const url=origin+"/api/assistant-files/"+preview+"?preview=1";
      const response=await generated.GET(new Request(url,{headers}),{params:Promise.resolve({id:preview})});
      assert.equal(response.status,200);
      assert.equal(response.headers.get("content-disposition"),'attachment; filename="preview.webp"');
      await db.query("UPDATE portal_assistant_files SET created_at=now()-interval '25 hours' WHERE id=$1",[preview]);
      assert.equal((await generated.GET(new Request(url,{headers}),{params:Promise.resolve({id:preview})})).status,404);

    });
  } finally {await closeAuthDatabase();await db.end();await databasePool.end().catch(()=>{});}
});
