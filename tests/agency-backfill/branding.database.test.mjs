import {test} from "node:test";
import assert from "node:assert/strict";
import {readFile,writeFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {login,mailFor} from "../account-security/fixture.mjs";
import {seedBrandingFixture} from "../../scripts/agency-branding-fixture.mjs";
test("Stage 15 agency branding boundaries",{skip:!process.env.AGENCY_BRANDING_FIXTURE},async t=>{
 const u=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL),runtime=new URL(process.env.DATABASE_URL),origin=process.env.BETTER_AUTH_URL;
 assert.equal(u.hostname,"127.0.0.1");assert.match(u.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);assert.equal(u.host,runtime.host);assert.equal(u.pathname,runtime.pathname);assert.notEqual(u.username,runtime.username);
 const db=new pg.Client({connectionString:u.href});await db.connect();const {createPortalAuth,closeAuthDatabase}=await import("../../lib/auth.js"),{databasePool}=await import("../../lib/database.js");const auth=createPortalAuth({useNextCookies:false});
 const service=await import("../../lib/agency-branding.js"),api=await import("../../app/api/admin/agency/brand/route.js"),account=await import("../../app/api/account/security/route.js");
 try{
  let f=JSON.parse(await readFile(process.env.ACCOUNT_SECURITY_FIXTURE,"utf8"));const [A,B]=f.agencies;
  for(const [key,a] of Object.entries(f.accounts).filter(([key])=>key!=="staffA")){a.cookie=(await login(auth,a,origin)).cookie;a.session=(await auth.api.getSession({headers:new Headers({cookie:a.cookie})})).session.id;}
  f=await seedBrandingFixture(db,f);
  const h=key=>new Headers({origin,host:new URL(origin).host,"content-type":"application/json",cookie:f.accounts[key].cookie});
  const req=(key,a,body,extra="")=>new Request(origin+"/api/admin/agency/brand?agency="+a.slug+extra,{method:body?"POST":"GET",headers:h(key),...(body?{body:JSON.stringify(body)}:{})});
  const settings=b=>Object.fromEntries(["portalName","reportName","legalName","supportName","supportEmail","palette","poweredBy"].map(k=>[k,b[k]]));
  await t.test("two public brands reveal only presentation; owner and assigned staff views remain scoped",async()=>{
   const a=await service.publicBrand(A.slug),b=await service.publicBrand(B.slug);assert.notEqual(a.portalName,b.portalName);assert.notEqual(a.logoUrl,b.logoUrl);assert.notEqual(a.palette.primary,b.palette.primary);assert.doesNotMatch(JSON.stringify(a),/api_key|source|accountIdentifier|cookie|password/);
   assert.equal((await api.GET(req("ownerA",A))).status,200);assert.equal((await api.GET(req("ownerA",B))).status,403);assert.equal((await api.GET(req("invitee",A))).status,200);assert.equal((await api.GET(req("clientA",A))).status,403);await assert.rejects(service.publicBrand("unknown-agency"));
  });
  await t.test("owner-only edits deny staff, foreign scope, mass assignment and unsafe colors/logo; denied writes leave no changes",async()=>{
   const old=await service.publicBrand(A.slug),body={settings:settings(old),revision:old.revision,operation:randomUUID(),reason:"Synthetic branding change",logoAction:"keep"};
   assert.equal((await api.POST(req("invitee",A,body))).status,403);assert.equal((await api.POST(req("ownerA",B,body))).status,403);assert.equal((await api.POST(req("ownerA",A,{...body,agencyId:B.id}))).status,400);
   for(const bad of [{...body,settings:{...body.settings,palette:{...old.palette,onPrimary:old.palette.primary}}},{...body,logoAction:"replace",logo:Buffer.from('<svg onload="x()"/>').toString('base64')}])assert.notEqual((await api.POST(req("ownerA",A,bad))).status,200);
   assert.deepEqual(await service.publicBrand(A.slug),old);
   assert.equal((await api.POST(req("ownerA",A,{...body,settings:{...body.settings,portalName:"Harbor Studio revised"}}))).status,200);assert.equal((await api.POST(req("ownerA",A,body))).status,409);
   const updated=await service.publicBrand(A.slug);assert.equal(updated.portalName,"Harbor Studio revised");f.brands[0].portalName=updated.portalName;
  });
  await t.test("permitted report exports use current agency identity and no foreign client fields",async()=>{
   const result=await api.GET(req("ownerA",A,null,"&download=json"));assert.equal(result.status,200);const data=await result.json();assert.equal(data.identity.portalName,"Harbor Studio revised");assert.ok(data.clients.every(c=>!f.clients.filter(c=>c.agencyId===B.id).some(x=>x.id===c.id)));
   assert.equal((await api.GET(req("ownerA",B,null,"&download=csv"))).status,403);const csv=await api.GET(req("invitee",A,null,"&download=csv"));assert.equal(csv.status,200);assert.match(await csv.text(),/Harbor Studio/);assert.match(csv.headers.get("cache-control"),/no-store/);
  });
  await t.test("domain collisions, untrusted callers and provider refresh races reject",async()=>{
   const domain="portal.fictional-harbor.example",body={hostname:domain,operation:randomUUID(),reason:"Synthetic domain request"};
   await service.requestBrandDomain(h("ownerA"),A.slug,body);await assert.rejects(service.requestBrandDomain(h("ownerB"),B.slug,{...body,operation:randomUUID()}),{code:"23505"});await assert.rejects(service.checkBrandDomain(h("ownerA"),domain,{inspect:()=>{throw Error("must not call");}}),{code:"42501"});
   const provider={inspect:async()=>({verified:true,projectId:"prj_synthetic",challenges:[]})};assert.equal((await service.checkBrandDomain(h("platformOnly"),domain,provider)).routingEnabled,false);
   await assert.rejects(service.checkBrandDomain(h("platformOnly"),domain,{inspect:async()=>{await db.query("UPDATE agency_platform.agency_domains SET generation=generation+1,status='revoked' WHERE hostname=$1",[domain]);return {verified:true,projectId:"prj_synthetic",challenges:[]};}}),{code:"40001"});
   assert.equal((await db.query("SELECT status FROM agency_platform.agency_domains WHERE hostname=$1",[domain])).rows[0].status,"revoked");
  });
  await t.test("branded email callbacks stay same-origin and account-bound; legacy MFA session checks remain active",async()=>{
   const a=f.accounts.staffB;const response=await account.POST(new Request(origin+"/api/account/security?brand="+B.slug,{method:"POST",headers:h("ownerB"),body:JSON.stringify({action:"recovery",email:a.email})}));assert.equal(response.status,200);
   const mail=await mailFor(a.email,"reset");assert.equal(new URL(mail.link).pathname,"/portal/"+B.slug+"/reset");assert.equal(mail.identity.portalName,"Summit Collective");assert.equal(new URL(mail.link).search,"");
   await db.query("DELETE FROM agency_platform.session_factors WHERE session_id=$1",[f.accounts.ownerA.session]);assert.equal((await api.GET(req("ownerA",A))).status,403);
  });
  await t.test("normalized public logos are PNG-only and private stores are not made public",async()=>{
   const logo=await import("../../app/api/portal-brand/[slug]/logo/route.js");const brand=await service.publicBrand(A.slug);
   const result=await logo.GET(new Request(origin+brand.logoUrl),{params:Promise.resolve({slug:A.slug})});assert.equal(result.status,200);assert.equal(result.headers.get("content-type"),"image/png");assert.match(result.headers.get("x-content-type-options"),/nosniff/);assert.match(result.headers.get("cache-control"),/no-store/);
   assert.equal((await logo.GET(new Request(origin+"/api/portal-brand/unknown/logo?revision=0"),{params:Promise.resolve({slug:"unknown-agency"})})).status,404);
   assert.equal((await logo.GET(new Request(origin+"/api/portal-brand/"+A.slug+"/logo?revision=999999"),{params:Promise.resolve({slug:A.slug})})).status,404);
  });
  await t.test("suspension, RLS, pooled reuse and assistant settings separation remain enforced",async()=>{
   for(const table of ["agency_branding","agency_domains"])await assert.rejects(databasePool.query("SELECT * FROM agency_platform."+table),{code:"42501"});
   assert.equal((await databasePool.query("SELECT current_user=session_user clean")).rows[0].clean,true);
   await db.query("UPDATE agency_platform.agencies SET is_active=false WHERE id=$1",[B.id]);await assert.rejects(service.publicBrand(B.slug));assert.equal((await api.GET(req("ownerB",B))).status,404);await db.query("UPDATE agency_platform.agencies SET is_active=true WHERE id=$1",[B.id]);
   assert.ok(!(await db.query("SELECT column_name FROM information_schema.columns WHERE table_schema='agency_platform' AND table_name='agency_branding'")).rows.some(x=>/greeting|assistant|prompt|vector/.test(x.column_name)));
  });
  await writeFile(process.env.AGENCY_BRANDING_FIXTURE,JSON.stringify(f),{mode:0o600});
 }finally{await closeAuthDatabase();await db.end();}
});
