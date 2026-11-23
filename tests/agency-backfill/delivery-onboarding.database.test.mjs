import {test} from "node:test";
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {writeFile} from "node:fs/promises";
import pg from "pg";
import {createDeliveryOnboardingFixture} from "../../scripts/delivery-onboarding-fixture.mjs";
import {STARTER_PROFILES} from "../../lib/delivery-profile-policy.js";
test("Stage16A approved role guidance and isolated delivery onboarding",{skip:!process.env.DELIVERY_ONBOARDING_FIXTURE},async t=>{
 const operator=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL),runtime=new URL(process.env.DATABASE_URL),origin=process.env.BETTER_AUTH_URL;
 assert.equal(operator.hostname,"127.0.0.1");assert.equal(runtime.host,operator.host);assert.equal(runtime.pathname,operator.pathname);assert.match(operator.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);assert.notEqual(runtime.username,operator.username);
 const db=new pg.Client({connectionString:operator.href});await db.connect();
 const {createPortalAuth,closeAuthDatabase}=await import("../../lib/auth.js"),{databasePool}=await import("../../lib/database.js");
 const auth=createPortalAuth({allowAccountCreation:true,useNextCookies:false});const admin=await import("../../app/api/admin/agency/onboarding/route.js"),participant=await import("../../app/api/onboarding/route.js");let f;
 try{
  f=await createDeliveryOnboardingFixture(db,auth,origin);const [A,B]=f.agencies;
  const h=(who,agency=A)=>new Headers({host:new URL(origin).host,origin,cookie:f.accounts[who].cookie,"content-type":"application/json","x-aoc-agency-admin":agency.id});
  const request=(who,body=null,agency=A)=>new Request(origin+"/api/admin/agency/onboarding?agency="+agency.slug,{headers:h(who,agency),method:body?"POST":"GET",...(body?{body:JSON.stringify(body)}:{})});
  const command=(action,more={})=>({action,operation:randomUUID(),reason:"Synthetic approved delivery onboarding",...more});
  const change=async(who,body,agency=A)=>{const r=await admin.POST(request(who,body,agency));assert.equal(r.status,200,await r.clone().text());return r.json();};
  const view=(who,id)=>participant.GET(new Request(origin+"/api/onboarding"+(id?"?run="+id:""),{headers:h(who)}));
  const progress=(who,id,revision="0",more={})=>participant.POST(new Request(origin+"/api/onboarding",{method:"POST",headers:h(who),body:JSON.stringify({id,revision,operation:randomUUID(),step:"businessKnowledge",status:"complete",note:"Reviewed approved business context",...more})}));
  const identity=(await db.query("SELECT to_jsonb(m) data FROM agency_platform.memberships m ORDER BY agency_id,user_id")).rows;
  f.profiles=[];f.runs=[];
  await t.test("draft profiles need explicit approval and atomic retries do not duplicate",async()=>{
   for(const [i,agency] of [A,B].entries()){
    const who=i?"ownerB":"ownerA",fields={...STARTER_PROFILES[0].fields,name:i?"B16A_SECRET_PROFILE":"Harbor development onboarding"};const c=command("profile.save",{revision:"0",fields});
    const result=await change(who,c,agency);assert.equal((await change(who,c,agency)).id,result.id);f.profiles.push(result.id);
    const assign=command("run.assign",{profileId:result.id,profileRevision:"1",clientId:f.clients[i?2:0].id,userId:f.accounts[i?"staffB":"staffA"].id,assignmentId:null,reviewOwner:f.accounts[who].id,expiresAt:new Date(Date.now()+86400000).toISOString()});
    assert.equal((await admin.POST(request(who,assign,agency))).status,403);
    await change(who,command("profile.approve",{id:result.id,revision:"1"}),agency);f.runs.push((await change(who,assign,agency)).id);
   }
  });
  await t.test("no-Hubstaff staff onboarding resumes with scoped progress, conflict and replay checks",async()=>{
   const before=await view("staffA",f.runs[0]);assert.equal(before.status,200);assert.equal((await before.json()).profileRevision,"1");
   const op=randomUUID();assert.equal((await progress("staffA",f.runs[0],"0",{operation:op})).status,200);assert.equal((await progress("staffA",f.runs[0],"0",{operation:op})).status,200);
   assert.equal((await progress("staffA",f.runs[0],"0")).status,409);
   const saved=await(await view("staffA",f.runs[0])).json();assert.equal(saved.revision,"1");assert.equal(saved.steps.businessKnowledge.status,"complete");assert.match((await view("staffA",f.runs[0])).headers.get("cache-control"),/no-store/);
   assert.equal((await db.query("SELECT hubstaff_project_url FROM portal_clients WHERE id=$1",[f.clients[0].id])).rows[0].hubstaff_project_url,null);
  });
  await t.test("cross-agency, same-agency clients, account substitution and role escalation are denied",async()=>{
   const before=(await db.query("SELECT to_jsonb(r) data FROM agency_platform.delivery_onboarding r ORDER BY id")).rows;
   for(const who of ["staffB","clientA","internal","engagementOnly"]){assert.equal((await view(who,f.runs[0])).status,403);assert.equal((await progress(who,f.runs[0],"1")).status,403);}
   assert.equal((await admin.GET(request("ownerA",null,B))).status,403);assert.equal((await admin.GET(request("staffA"))).status,403);
   assert.equal((await admin.POST(request("ownerA",command("profile.save",{revision:"0",fields:{role:"agency_admin"}})))).status,400);
   const bad=command("run.assign",{profileId:f.profiles[0],profileRevision:"1",clientId:f.clients[1].id,userId:f.accounts.staffA.id,assignmentId:null,reviewOwner:f.accounts.ownerA.id,expiresAt:new Date(Date.now()+86400000).toISOString()});assert.equal((await admin.POST(request("ownerA",bad))).status,403);
   assert.equal((await admin.POST(request("ownerA",{...bad,clientId:f.clients[2].id}))).status,403);
   assert.deepEqual((await db.query("SELECT to_jsonb(r) data FROM agency_platform.delivery_onboarding r ORDER BY id")).rows,before);
   assert.doesNotMatch(await(await admin.GET(request("ownerA"))).text(),/B16A_SECRET_PROFILE/);
  });
  await t.test("profile edits cannot alter pinned guidance or add access; approval selects a new revision",async()=>{
   await change("ownerA",command("profile.save",{id:f.profiles[0],revision:"1",fields:{...STARTER_PROFILES[1].fields,name:"Updated draft, not published"}}));
   assert.equal((await(await view("staffA",f.runs[0])).json()).profile.name,"Harbor development onboarding");
   assert.deepEqual((await db.query("SELECT to_jsonb(m) data FROM agency_platform.memberships m ORDER BY agency_id,user_id")).rows,identity);
   await change("ownerA",command("profile.approve",{id:f.profiles[0],revision:"2"}));
   assert.equal((await(await view("staffA",f.runs[0])).json()).profileRevision,"1");
  });
  await t.test("approved specialists onboard only within their live assignment; engagement alone grants nothing",async()=>{
   const input=command("run.assign",{profileId:f.profiles[0],profileRevision:"2",clientId:f.clients[0].id,userId:f.accounts.specialist.id,assignmentId:f.assignments[0],reviewOwner:f.accounts.ownerA.id,expiresAt:new Date(Date.now()+86400000).toISOString()});
   f.specialistRun=(await change("ownerA",input)).id;assert.equal((await view("specialist",f.specialistRun)).status,200);assert.equal((await progress("specialist",f.specialistRun)).status,200);
   const body=await(await view("specialist",f.specialistRun)).text();assert.ok(!body.includes(f.hrCanary));assert.ok(!body.includes("B16A_SECRET_PROFILE"));
   await db.query("UPDATE agency_platform.specialist_assignments SET status='revoked' WHERE id=$1",[f.assignments[0]]);assert.equal((await view("specialist",f.specialistRun)).status,403);assert.equal((await progress("specialist",f.specialistRun,"1")).status,403);await db.query("UPDATE agency_platform.specialist_assignments SET status='active' WHERE id=$1",[f.assignments[0]]);
  });
  await t.test("read-only specialist scope cannot update progress and the view advertises that restriction",async()=>{
   await db.query("UPDATE agency_platform.specialist_assignments SET actions=ARRAY['delivery.read'] WHERE id=$1",[f.assignments[0]]);const readonly=await(await view("specialist",f.specialistRun)).json();assert.equal(readonly.canEdit,false);assert.equal((await progress("specialist",f.specialistRun,"1")).status,403);await db.query("UPDATE agency_platform.specialist_assignments SET actions=ARRAY['delivery.read','delivery.notes.write'] WHERE id=$1",[f.assignments[0]]);
  });
  await t.test("revocation, suspension, expiry, lost membership and retirement reject stale access",async()=>{
   for(const [mutate,restore] of [["UPDATE agency_platform.agencies SET is_active=false WHERE id="+A.id,"UPDATE agency_platform.agencies SET is_active=true WHERE id="+A.id],["UPDATE agency_platform.memberships SET is_active=false WHERE agency_id="+A.id+" AND user_id="+f.accounts.staffA.id,"UPDATE agency_platform.memberships SET is_active=true WHERE agency_id="+A.id+" AND user_id="+f.accounts.staffA.id]]){await db.query(mutate);assert.equal((await view("staffA",f.runs[0])).status,403);await db.query(restore);}
   const row=(await db.query("SELECT created_at,expires_at FROM agency_platform.delivery_onboarding WHERE id=$1",[f.runs[0]])).rows[0];await db.query("UPDATE agency_platform.delivery_onboarding SET created_at=now()-interval '2 days',expires_at=now()-interval '1 day' WHERE id=$1",[f.runs[0]]);assert.equal((await view("staffA",f.runs[0])).status,403);await db.query("UPDATE agency_platform.delivery_onboarding SET created_at=$2,expires_at=$3 WHERE id=$1",[f.runs[0],row.created_at,row.expires_at]);
   await change("ownerA",command("run.revoke",{id:f.runs[0],revision:"1"}));assert.equal((await view("staffA",f.runs[0])).status,403);await db.query("UPDATE agency_platform.delivery_onboarding SET revoked_at=NULL,revision=0,steps='{}' WHERE id=$1",[f.runs[0]]);
  });
  await t.test("retired profiles, replaced specialist assignments and role downgrades block subsequent access",async()=>{
   await change("ownerA",command("profile.retire",{id:f.profiles[0],revision:"2"}));assert.equal((await view("staffA",f.runs[0])).status,403);assert.equal((await progress("staffA",f.runs[0],"0")).status,403);await db.query("UPDATE agency_platform.delivery_profiles SET retired=false WHERE id=$1",[f.profiles[0]]);
   await db.query("UPDATE agency_platform.specialist_assignments SET status='replaced' WHERE id=$1",[f.assignments[0]]);assert.equal((await view("specialist",f.specialistRun)).status,403);await db.query("UPDATE agency_platform.specialist_assignments SET status='active' WHERE id=$1",[f.assignments[0]]);
   await db.query("UPDATE agency_platform.memberships SET role='client_user' WHERE agency_id=$1 AND user_id=$2",[A.id,f.accounts.staffA.id]);assert.equal((await view("staffA",f.runs[0])).status,403);await db.query("UPDATE agency_platform.memberships SET role='staff' WHERE agency_id=$1 AND user_id=$2",[A.id,f.accounts.staffA.id]);
  });
  await t.test("runtime roles cannot read backing tables or inherit pooled context; ownership checks remain intact",async()=>{
   for(const table of ["delivery_profiles","delivery_profile_revisions","delivery_onboarding","delivery_onboarding_operations"])await assert.rejects(databasePool.query("SELECT * FROM agency_platform."+table),{code:"42501"});
   assert.equal((await databasePool.query("SELECT current_user=session_user clean")).rows[0].clean,true);
   const rls=(await db.query("SELECT count(*)::int n FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='agency_platform' AND relname=ANY($1::text[]) AND relrowsecurity AND relforcerowsecurity",[["delivery_profiles","delivery_profile_revisions","delivery_onboarding","delivery_onboarding_operations"]])).rows[0].n;assert.equal(rls,4);
   await assert.rejects(db.query("UPDATE agency_platform.delivery_onboarding SET agency_id=$2 WHERE id=$1",[f.runs[0],B.id]),{code:"23503"});
   assert.deepEqual((await db.query("SELECT to_jsonb(m) data FROM agency_platform.memberships m ORDER BY agency_id,user_id")).rows,identity);
  });
  // Browser review starts with the approved original profile and fresh progress.
  await writeFile(process.env.DELIVERY_ONBOARDING_FIXTURE,JSON.stringify(f),{mode:0o600});
 }finally{await closeAuthDatabase();await db.end();}
});
