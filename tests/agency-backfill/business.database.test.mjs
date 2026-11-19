import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {spawnSync} from "node:child_process";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {createBusinessFixture,businessWebsiteEvidence} from "../../scripts/business-review-fixture.mjs";
test("Stage16 no-Hubstaff business onboarding",{skip:!process.env.BUSINESS_FIXTURE},async t=>{
 const u=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL),runtime=new URL(process.env.DATABASE_URL),origin=process.env.BETTER_AUTH_URL;
 assert.equal(u.hostname,"127.0.0.1");assert.match(u.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);assert.equal(u.host,runtime.host);assert.equal(u.pathname,runtime.pathname);assert.notEqual(u.username,runtime.username);
 const db=new pg.Client({connectionString:u.href});await db.connect();
 const {createPortalAuth,closeAuthDatabase}=await import("../../lib/auth.js"),{databasePool}=await import("../../lib/database.js");
 const auth=createPortalAuth({allowAccountCreation:true,useNextCookies:false});const api=await import("../../app/api/client/business/route.js"),sites=await import("../../app/api/client/website-insights/route.js");
 let f;
 try{
  f=await createBusinessFixture(db,auth,origin);const [A,B]=f.clients;
  const h=(key,id=A.id)=>new Headers({origin,host:new URL(origin).host,"content-type":"application/json",cookie:f.accounts[key].cookie,"x-aoc-client":id});
  const req=(key,body,id=A.id)=>new Request(origin+"/api/client/business",{headers:h(key,id),method:body?"POST":"GET",...(body?{body:JSON.stringify(body)}:{})});
  const command=(over={})=>({description:"A16_ORCHID_COFFEE\nSecond paragraph",audience:"Local readers",services:"Coffee",goals:"Improve website clarity",websiteUrl:"https://orchid.example/",revision:"0",complete:false,operation:randomUUID(),...over});
  const old=(await db.query("SELECT to_jsonb(c) data FROM portal_clients c WHERE id<=701 ORDER BY id")).rows;
  await t.test("agency creates unmapped clients and real auth resolves them with no provider settings",async()=>{
   for(const client of f.clients){const row=(await db.query("SELECT hubstaff_project_url,hubstaff_tracking_project_id FROM portal_clients WHERE id=$1",[client.id])).rows[0];assert.equal(row.hubstaff_project_url,null);assert.equal(row.hubstaff_tracking_project_id,null);}
   const result=await api.GET(req("businessA"));assert.equal(result.status,200);assert.equal((await result.json()).hubstaffConfigured,false);
  });
  await t.test("optional profile saves paragraphs, resumes draft and completes with revision conflicts protected",async()=>{
   assert.equal((await api.POST(req("businessA",command()))).status,200);
   let p=(await(await api.GET(req("businessA"))).json()).profile;assert.equal(p.completedAt,null);assert.match(p.description,/Second paragraph/);assert.equal(p.revision,"1");
   assert.equal((await api.POST(req("businessA",command()))).status,409);
   assert.equal((await api.POST(req("businessA",command({revision:"1",complete:true})))).status,200);
   p=(await(await api.GET(req("businessA"))).json()).profile;assert.ok(p.completedAt);assert.ok(p.updatedAt);
   assert.equal((await db.query("SELECT approved_website_url FROM portal_clients WHERE id=$1",[A.id])).rows[0].approved_website_url,null);
  });
  await t.test("foreign and same-agency identifiers, viewer/member writes and escalation are denied without changes",async()=>{
   const before=(await db.query("SELECT to_jsonb(b) data FROM agency_platform.client_business_profiles b ORDER BY client_id")).rows;
   assert.notEqual((await api.GET(req("businessA",null,B.id))).status,200);
   for(const key of ["viewer","member"])assert.equal((await api.POST(req(key,command({revision:"2"})))).status,403);
   assert.equal((await api.POST(req("businessA",{...command(),agencyId:f.agency.id}))).status,400);
   await assert.rejects(databasePool.query("SELECT agency_platform.business_view($1,$2,$3)",[f.accounts.businessA.accountIdentifier,f.accounts.businessA.session,B.id]),{code:"42501"});
   const foreign=JSON.parse(await readFile(process.env.AGENCY_BRANDING_FIXTURE,"utf8"));const person=foreign.accounts.ownerB;
   await assert.rejects(databasePool.query("SELECT agency_platform.business_view($1,$2,$3)",[person.accountIdentifier,person.session,A.id]),{code:"42501"});
   await assert.rejects(db.query("INSERT INTO agency_platform.client_business_profiles(agency_id,client_id) VALUES($1,$2)",[foreign.agencies[1].id,B.id]),{code:"23503"});
   assert.deepEqual((await db.query("SELECT to_jsonb(b) data FROM agency_platform.client_business_profiles b ORDER BY client_id")).rows,before);
   assert.equal((await api.GET(req("viewer"))).status,200);
  });
  await t.test("saved website reports and exports remain accessible without Hubstaff and cannot cross clients",async()=>{
   f.reports=[];
   for(const [i,c] of f.clients.entries()){
    const who=i?"businessB":"businessA",headers=h(who,c.id);
    const added=await sites.POST(new Request(origin+"/api/client/website-insights",{method:"POST",headers,body:JSON.stringify({action:"add",name:i?"B16_SECRET":"Orchid demo website",url:i?"https://birch.example/":"https://orchid.example/"})}));assert.equal(added.status,201);
    const site=(await added.json()).website;const id=randomUUID();
    const result=businessWebsiteEvidence(i?"https://birch.example/":"https://orchid.example/",i?"B16_SECRET":"A16_WEBSITE_TITLE");
    await db.query("INSERT INTO portal_website_insights_reports(id,website_id,client_id,started_by,status,state,result,finished_at) VALUES($1,$2,$3,$4,'complete','{\"stage\":\"complete\"}',$5,now())",[id,site.id,c.id,f.accounts[who].id,JSON.stringify(result)]);f.reports.push({id,siteId:site.id});
   }
   const own=await sites.GET(new Request(origin+"/api/client/website-insights?report="+f.reports[0].id,{headers:h("businessA")}));assert.equal(own.status,200);
   const denied=await sites.GET(new Request(origin+"/api/client/website-insights?report="+f.reports[1].id,{headers:h("businessA")}));assert.equal(denied.status,404);assert.doesNotMatch(await denied.text(),/B16_SECRET/);
   const saved=await api.GET(req("businessA"));assert.match(saved.headers.get("cache-control"),/no-store/);assert.doesNotMatch(JSON.stringify(await saved.json()),/B16_SECRET/);
   const csv=await sites.GET(new Request(origin+"/api/client/website-insights?report="+f.reports[0].id+"&download=csv",{headers:h("businessA")}));assert.equal(csv.status,200);
  });
  await t.test("AI evidence is fresh and scoped; RLS and revoked/suspended workspace checks reject",async()=>{
   const evidence=await databasePool.query("SELECT agency_platform.business_evidence($1,$2,$3) data",[f.accounts.businessA.accountIdentifier,f.accounts.businessA.session,A.id]);assert.match(JSON.stringify(evidence.rows[0].data),/A16_ORCHID_COFFEE/);assert.match(JSON.stringify(evidence.rows[0].data),/A16_WEBSITE_TITLE/);assert.doesNotMatch(JSON.stringify(evidence.rows[0].data),/B16_SECRET/);
   await assert.rejects(databasePool.query("SELECT * FROM agency_platform.client_business_profiles"),{code:"42501"});assert.equal((await databasePool.query("SELECT current_user=session_user clean")).rows[0].clean,true);
   await db.query("UPDATE agency_platform.client_access SET access_level='read' WHERE agency_id=$1 AND client_id=$2 AND user_id=$3",[f.agency.id,A.id,f.accounts.businessA.id]);
   assert.equal((await(await api.GET(req("businessA"))).json()).profile.canEdit,false);
   assert.equal((await api.POST(req("businessA",command({revision:"2"})))).status,403);
   await db.query("UPDATE agency_platform.client_access SET access_level='manage' WHERE agency_id=$1 AND client_id=$2 AND user_id=$3",[f.agency.id,A.id,f.accounts.businessA.id]);
   await db.query("UPDATE portal_memberships SET is_active=false WHERE client_id=$1 AND user_id=$2",[A.id,f.accounts.businessA.id]);assert.notEqual((await api.GET(req("businessA"))).status,200);
   await db.query("UPDATE portal_memberships SET is_active=true WHERE client_id=$1 AND user_id=$2",[A.id,f.accounts.businessA.id]);
   await db.query("UPDATE agency_platform.agencies SET is_active=false WHERE id=$1",[f.agency.id]);assert.notEqual((await api.GET(req("businessA"))).status,200);await db.query("UPDATE agency_platform.agencies SET is_active=true WHERE id=$1",[f.agency.id]);
  });
  await t.test("Python runtime loads current business evidence and denies foreign/revoked access (no model)",async()=>{
   const result=spawnSync(".venv/Scripts/python.exe",["-m","unittest","discover","-s","chatkit_backend/tests","-p","test_stage16_business_database.py"],{env:{...process.env,STAGE16_BUSINESS_BOUNDARY:JSON.stringify(f)},encoding:"utf8"});
   assert.equal(result.status,0,result.stdout+result.stderr);
  });
  await t.test("existing client identities, mapped project fields and legacy rows are unchanged",async()=>{assert.deepEqual((await db.query("SELECT to_jsonb(c) data FROM portal_clients c WHERE id<=701 ORDER BY id")).rows,old);});
  await writeFile(process.env.BUSINESS_FIXTURE,JSON.stringify(f),{mode:0o600});
 }finally{await closeAuthDatabase();await db.end();}
});
