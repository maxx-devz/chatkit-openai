import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile,writeFile } from "node:fs/promises";
import { randomUUID,randomBytes,createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import pg from "pg";
import { prepareAccountSecurity,login,otp,mergeCookie,mailFor } from "../account-security/fixture.mjs";

test("Stage 14 provider and workspace account controls",{skip:!process.env.ACCOUNT_SECURITY_FIXTURE},async t=>{
 const url=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL),runtime=new URL(process.env.DATABASE_URL),origin=process.env.BETTER_AUTH_URL;
 assert.equal(url.hostname,"127.0.0.1");assert.match(url.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);assert.equal(url.host,runtime.host);assert.equal(url.pathname,runtime.pathname);assert.notEqual(url.username,runtime.username);
 assert.equal(process.env.PORTAL_ACCOUNT_SECURITY_ENABLED,"true");
 const db=new pg.Client({connectionString:url.href});await db.connect();
 const {createPortalAuth,closeAuthDatabase}=await import("../../lib/auth.js"),{databasePool}=await import("../../lib/database.js");
 const auth=createPortalAuth({allowAccountCreation:true,useNextCookies:false}),api=await import("../../app/api/account/security/route.js"),inbox=await import("../../app/api/admin/agency/invitations/route.js"),agency=await import("../../app/api/admin/agency/route.js");
 let f;
 try {
  f=JSON.parse(await readFile(process.env.SPECIALIST_FIXTURE,"utf8"));
  const [A,B]=f.agencies;
  const headers=key=>new Headers({origin,host:new URL(origin).host,"content-type":"application/json","x-forwarded-for":"127.0.0.14",cookie:f.accounts[key].cookie});
  const post=(key,body,extra={})=>api.POST(new Request(origin+"/api/account/security",{method:"POST",headers:new Headers({...Object.fromEntries(headers(key)),...extra}),body:JSON.stringify(body)}));
  await t.test("installed policy rejects password-only privileged sessions before enrollment",async()=>{
   const a=f.accounts.ownerA;
   const state=(await databasePool.query("SELECT agency_platform.account_status($1,$2) data",[a.accountIdentifier,a.session])).rows[0].data;
   assert.equal(state.required,true);assert.equal(state.assured,false);
   // Existing Stage 13 session remains valid for identity, but not privilege.
   await assert.rejects(databasePool.query("SELECT agency_platform.agency_admin_view($1,$2,$3,'')",[a.accountIdentifier,a.session,A.id]),{code:"42501"});
   assert.equal((await agency.GET(new Request(origin+"/api/admin/agency?agency="+A.slug,{headers:headers("ownerA")}))).status,403);
   await assert.rejects(databasePool.query("SELECT * FROM agency_platform.console_actor($1,$2,false)",[f.accounts.platformOnly.accountIdentifier,f.accounts.platformOnly.session]),{code:"42501"});
  });
  await t.test("real provider verifies captured emails, enrolls TOTP, rotates sessions and attests MFA",async()=>{
   f=await prepareAccountSecurity(db,auth,f,origin);
   for(const key of ["ownerA","ownerB","adminA","platformOnly"]) {
    const a=f.accounts[key],state=(await databasePool.query("SELECT agency_platform.account_status($1,$2) data",[a.accountIdentifier,a.session])).rows[0].data;
    assert.equal(state.assured,true);assert.equal(state.emailVerified,true);assert.equal(state.twoFactorEnabled,true);
   }
   assert.equal((await agency.GET(new Request(origin+"/api/admin/agency?agency="+A.slug,{headers:headers("ownerA")}))).status,200);
  });
  await t.test("password login requires a signed MFA challenge; failed OTP and trusted-device claims cannot grant access",async()=>{
   const a=f.accounts.ownerA,signed=await login(auth,a,origin,{factor:false});assert.equal(signed.challenge,true);
   assert.equal(await auth.api.getSession({headers:new Headers({cookie:signed.cookie})}),null);
   const bad=await auth.api.verifyTOTP({body:{code:"bad000"},headers:new Headers({origin,cookie:signed.cookie}),asResponse:true});assert.equal(bad.ok,false);
   await assert.rejects(auth.api.verifyTOTP({body:{code:await otp(a.totpURI),trustDevice:true},headers:new Headers({origin,cookie:signed.cookie}),asResponse:true}), e=>e.status==="FORBIDDEN");
   const good=await auth.api.verifyTOTP({body:{code:await otp(a.totpURI)},headers:new Headers({origin,cookie:signed.cookie}),asResponse:true});assert.equal(good.status,200);
   const fresh=mergeCookie(signed.cookie,good);assert.ok((await auth.api.getSession({headers:new Headers({cookie:fresh})})).session.id);
  });
  await t.test("privileged MFA cannot be disabled; password alone cannot replace an enrolled factor",async()=>{
   const a=f.accounts.ownerA;
   await assert.rejects(auth.api.disableTwoFactor({body:{password:a.password},headers:headers("ownerA"),asResponse:true}), e=>e.status==="FORBIDDEN");
   await db.query("DELETE FROM agency_platform.session_factors WHERE session_id=$1",[a.session]);
   await assert.rejects(auth.api.enableTwoFactor({body:{password:a.password},headers:headers("ownerA"),asResponse:true}), e=>e.status==="FORBIDDEN");
   const verify=await auth.api.verifyTOTP({body:{code:await otp(a.totpURI)},headers:headers("ownerA"),asResponse:true});assert.equal(verify.status,200);
  });
  await t.test("backup codes recover a session exactly once without removing tenant permissions",async()=>{
   const a=f.accounts.ownerA,code=a.backupCodes.shift(),signed=await login(auth,a,origin,{factor:false});
   const result=await auth.api.verifyBackupCode({body:{code},headers:new Headers({origin,cookie:signed.cookie}),asResponse:true});assert.equal(result.status,200);
   const again=await login(auth,a,origin,{factor:false});
   assert.equal((await auth.api.verifyBackupCode({body:{code},headers:new Headers({origin,cookie:again.cookie}),asResponse:true})).ok,false);
  });
  const invite=async(recipient,{agencyTarget=A,author="ownerA",role="staff",clientId=null}={})=>{
   const owner=f.accounts[author],revision=(await databasePool.query("SELECT agency_platform.agency_admin_view($1,$2,$3,'') data",[owner.accountIdentifier,owner.session,agencyTarget.id])).rows[0].data.revision;
   const id=randomUUID(),secret=randomBytes(32).toString("hex");
   await databasePool.query("SELECT agency_platform.agency_admin_change($1,$2,$3,$4::jsonb)",[owner.accountIdentifier,owner.session,agencyTarget.id,JSON.stringify({action:"invite.create",account:f.accounts[recipient].accountIdentifier,role,...(clientId?{clientId,clientRole:"client_viewer"}:{}),operation:id,revision,reason:"Synthetic secure invitation"})]);
   await databasePool.query("SELECT agency_platform.issue_invitation_link($1,$2,$3,$4,$5)",[owner.accountIdentifier,owner.session,agencyTarget.id,id,createHash("sha256").update(secret).digest("hex")]);
   return {id,token:secret};
  };
  const accept=(key,link)=>inbox.POST(new Request(origin+"/api/admin/agency/invitations",{method:"POST",headers:headers(key),body:JSON.stringify(link)}));
  await t.test("wrong identity, forged agency fields, substituted token and UUID-only paths reject without consumption",async()=>{
   const link=await invite("unrelated");
   assert.equal((await accept("invitee",link)).status,403);
   assert.equal((await accept("unrelated",{...link,agencyId:B.id})).status,400);
   assert.equal((await accept("unrelated",{...link,token:randomBytes(32).toString("hex")})).status,403);
   await assert.rejects(databasePool.query("SELECT agency_platform.agency_accept_invitation($1,$2,$3)",[f.accounts.unrelated.accountIdentifier,f.accounts.unrelated.session,link.id]),{code:"42501"});
   await assert.rejects(databasePool.query("SELECT agency_platform.accept_invitation_internal($1,$2,$3)",[f.accounts.unrelated.accountIdentifier,f.accounts.unrelated.session,link.id]),{code:"42501"});
   assert.equal((await db.query("SELECT used_at FROM agency_platform.invitation_links WHERE invitation_id=$1",[link.id])).rows[0].used_at,null);
   const count=(await db.query('SELECT count(*)::int n FROM "user"')).rows[0].n;
   assert.equal((await accept("unrelated",link)).status,200);assert.equal((await accept("unrelated",link)).status,403);
   assert.equal((await db.query('SELECT count(*)::int n FROM "user"')).rows[0].n,count);
  });
  await t.test("expiry, concurrent replay and inviter downgrade are enforced atomically",async()=>{
   const expired=await invite("unrelated",{agencyTarget:B,author:"ownerB"});
   await db.query("UPDATE agency_platform.invitation_links SET expires_at=now()-interval '1 second' WHERE invitation_id=$1",[expired.id]);
   assert.equal((await accept("unrelated",expired)).status,403);await db.query("UPDATE agency_platform.agency_invitations SET status='revoked' WHERE id=$1",[expired.id]);
   const concurrent=await invite("unrelated",{agencyTarget:B,author:"ownerB"});
   assert.deepEqual((await Promise.all([accept("unrelated",concurrent),accept("unrelated",concurrent)])).map(x=>x.status).sort(),[200,403]);
   const pending=await invite("platformOnly",{author:"adminA"});
   await db.query("UPDATE agency_platform.memberships SET role='staff' WHERE agency_id=$1 AND user_id=$2",[A.id,f.accounts.adminA.id]);
   assert.equal((await accept("platformOnly",pending)).status,403);
   await db.query("UPDATE agency_platform.memberships SET role='agency_admin' WHERE agency_id=$1 AND user_id=$2",[A.id,f.accounts.adminA.id]);
   await db.query("UPDATE agency_platform.agency_invitations SET status='revoked' WHERE id=$1",[pending.id]);
  });
  await t.test("client invitation keeps its bound agency/client and rejects a foreign client without writes",async()=>{
   const before=(await db.query("SELECT count(*)::int n FROM agency_platform.agency_invitations")).rows[0].n;
   await assert.rejects(invite("clientA",{agencyTarget:B,author:"ownerB",role:"client_user",clientId:f.clients[0].id}));
   assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.agency_invitations")).rows[0].n,before);
   const bound=await invite("clientA",{agencyTarget:B,author:"ownerB",role:"client_user",clientId:f.clients[2].id});
   assert.equal((await accept("clientA",bound)).status,200);
   assert.equal((await db.query("SELECT role FROM portal_memberships WHERE client_id=$1 AND user_id=$2",[f.clients[2].id,f.accounts.clientA.id])).rows[0].role,"client_viewer");
  });
  await t.test("Members & Access requests require agency approval and cannot directly grant a role",async()=>{
   const requester=f.accounts.clientA,recipient=f.accounts.staffB,owner=f.accounts.ownerA,id=randomUUID(),secret=randomBytes(32).toString("hex"),hash=createHash("sha256").update(secret).digest("hex");
   const request=()=>databasePool.query("SELECT agency_platform.request_client_invitation($1,$2,$3,$4,'member',$5)",[requester.accountIdentifier,requester.session,f.clients[0].id,recipient.email,id]);
   await request();await request();
   const review=(await databasePool.query("SELECT agency_platform.invitation_review($1,$2,$3) data",[owner.accountIdentifier,owner.session,A.id])).rows[0].data.find(x=>x.id===id);
   assert.equal(review.recipientEmail,recipient.email);assert.equal(review.clientId,f.clients[0].id);assert.equal(review.approvalRequired,true);
   await assert.rejects(databasePool.query("SELECT agency_platform.invitation_review($1,$2,$3)",[f.accounts.ownerB.accountIdentifier,f.accounts.ownerB.session,A.id]),{code:"42501"});
   assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.agency_invitations WHERE id=$1",[id])).rows[0].n,1);
   assert.equal((await db.query("SELECT count(*)::int n FROM agency_platform.memberships WHERE agency_id=$1 AND user_id=$2 AND is_active",[A.id,recipient.id])).rows[0].n,0);
   await assert.rejects(databasePool.query("SELECT agency_platform.issue_invitation_link($1,$2,$3,$4,$5)",[requester.accountIdentifier,requester.session,A.id,id,hash]),{code:"42501"});
   await assert.rejects(databasePool.query("SELECT agency_platform.request_client_invitation($1,$2,$3,$4,'agency_admin',$5)",[requester.accountIdentifier,requester.session,f.clients[0].id,recipient.email,randomUUID()]),{code:"42501"});
   await assert.rejects(databasePool.query("SELECT agency_platform.request_client_invitation($1,$2,$3,$4,'member',$5)",[requester.accountIdentifier,requester.session,f.clients[2].id,recipient.email,randomUUID()]),{code:"42501"});
   await databasePool.query("SELECT agency_platform.issue_invitation_link($1,$2,$3,$4,$5)",[owner.accountIdentifier,owner.session,A.id,id,hash]);
   assert.equal((await accept("staffB",{id,token:secret})).status,200);
   assert.equal((await db.query("SELECT role FROM portal_memberships WHERE client_id=$1 AND user_id=$2",[f.clients[0].id,recipient.id])).rows[0].role,"member");
   assert.equal((await db.query("SELECT role FROM agency_platform.memberships WHERE agency_id=$1 AND user_id=$2",[B.id,recipient.id])).rows[0].role,"staff");
  });
  await t.test("expired MFA assurance and unverified stale sessions fail until fresh verification",async()=>{
   const a=f.accounts.ownerA;
   await db.query("UPDATE agency_platform.session_factors SET verified_at=now()-interval '13 hours' WHERE session_id=$1",[a.session]);
   await assert.rejects(databasePool.query("SELECT agency_platform.account_session($1,$2)",[a.accountIdentifier,a.session]),{code:"42501"});
   assert.equal((await auth.api.verifyTOTP({body:{code:await otp(a.totpURI)},headers:headers("ownerA"),asResponse:true})).status,200);
   const member=f.accounts.staffB;
   await db.query('UPDATE "user" SET "emailVerified"=false WHERE id=$1',[member.accountIdentifier]);
   await assert.rejects(databasePool.query("SELECT agency_platform.account_session($1,$2)",[member.accountIdentifier,member.session]),{code:"42501"});
   await db.query('UPDATE "user" SET "emailVerified"=true WHERE id=$1',[member.accountIdentifier]);
  });
  await t.test("workspace revocation preserves another agency; role elevation immediately requires MFA",async()=>{
   const a=f.accounts.multi,owner=f.accounts.ownerA;
   const revision=(await databasePool.query("SELECT agency_platform.agency_admin_view($1,$2,$3,'') data",[owner.accountIdentifier,owner.session,A.id])).rows[0].data.revision;
   await databasePool.query("SELECT agency_platform.agency_admin_change($1,$2,$3,$4::jsonb)",[owner.accountIdentifier,owner.session,A.id,JSON.stringify({action:"member.update",userId:a.id,role:"staff",active:false,operation:randomUUID(),revision,reason:"Revoke only Agency A"})]);
   await assert.rejects(databasePool.query("SELECT agency_platform.agency_admin_view($1,$2,$3,'')",[a.accountIdentifier,a.session,A.id]),{code:"42501"});
   assert.ok((await databasePool.query("SELECT agency_platform.agency_admin_view($1,$2,$3,'') data",[a.accountIdentifier,a.session,B.id])).rows[0].data);
   await db.query("UPDATE agency_platform.memberships SET role='agency_admin' WHERE agency_id=$1 AND user_id=$2",[B.id,a.id]);
   await assert.rejects(databasePool.query("SELECT agency_platform.agency_admin_view($1,$2,$3,'')",[a.accountIdentifier,a.session,B.id]),{code:"42501"});
   await db.query("UPDATE agency_platform.memberships SET role='staff' WHERE agency_id=$1 AND user_id=$2",[B.id,a.id]);
  });
  await t.test("recovery responses are generic; provider reset is single-use, revokes sessions and preserves MFA/memberships",async()=>{
   const a=f.accounts.ownerB;
   const known=await post("ownerA",{action:"recovery",email:a.email});const unknown=await post("ownerA",{action:"recovery",email:"unknown.synthetic@example.invalid"});assert.equal(known.status,unknown.status);assert.deepEqual(await known.json(),await unknown.json());
   const message=await mailFor(a.email,"reset");assert.equal(new URL(message.link).pathname,"/account/reset");assert.equal(new URL(message.link).search,"");
   const token=new URLSearchParams(new URL(message.link).hash.slice(1)).get("token"),password=randomBytes(24).toString("hex");
   const before=(await db.query("SELECT agency_id::text,role,is_active FROM agency_platform.memberships WHERE user_id=$1 ORDER BY agency_id",[a.id])).rows;
   assert.equal((await post("ownerA",{action:"reset",token,password})).status,200);assert.equal((await post("ownerA",{action:"reset",token,password})).status,400);
   assert.equal(await auth.api.getSession({headers:new Headers({cookie:a.cookie})}),null);
   assert.equal((await auth.api.signInUsername({body:{username:a.username,password:a.password},asResponse:true})).ok,false);
   a.password=password;const signed=await login(auth,a,origin,{factor:false});assert.equal(signed.challenge,true);
   assert.equal((await db.query('SELECT "twoFactorEnabled" FROM "user" WHERE id=$1',[a.accountIdentifier])).rows[0].twoFactorEnabled,true);
   assert.deepEqual((await db.query("SELECT agency_id::text,role,is_active FROM agency_platform.memberships WHERE user_id=$1 ORDER BY agency_id",[a.id])).rows,before);
   const completed=await login(auth,a,origin);a.cookie=completed.cookie;a.session=(await auth.api.getSession({headers:new Headers({cookie:a.cookie})})).session.id;
  });
  await t.test("expired reset and wrong-origin requests fail; auth cookies and database throttling are exercised",async()=>{
   const a=f.accounts.staffB;
   await auth.api.requestPasswordReset({body:{email:a.email,redirectTo:origin+"/account/reset"}});
   const message=await mailFor(a.email,"reset"),token=new URLSearchParams(new URL(message.link).hash.slice(1)).get("token");
   await db.query(`UPDATE verification SET "expiresAt"=now()-interval '1 second' WHERE identifier=$1`,["reset-password:"+token]);
   assert.equal((await post("ownerA",{action:"reset",token,password:randomBytes(24).toString("hex")})).status,400);
   assert.equal((await post("ownerA",{action:"recovery",email:a.email},{origin:"https://foreign.invalid"})).status,403);
   const signed=await auth.api.signInUsername({body:{username:a.username,password:a.password},headers:new Headers({origin}),asResponse:true});
   assert.match(signed.headers.get("set-cookie"),/HttpOnly/i);assert.match(signed.headers.get("set-cookie"),/SameSite=Lax/i);
   const replies=[];for(let i=0;i<4;i++)replies.push((await post("ownerA",{action:"verification",email:"unknown.synthetic@example.invalid"})).status);
   assert.ok(replies.includes(429));
  });
  await t.test("both runtime connectors reject ownership of the new Better Auth factor table",async()=>{
   const original=(await db.query(`SELECT r.rolname FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.oid='public."twoFactor"'::regclass`)).rows[0].rolname;
   const quote=v=>'"'+v.replaceAll('"','""')+'"';
   try{
    await db.query('ALTER TABLE public."twoFactor" OWNER TO '+quote(decodeURIComponent(runtime.username)));
    await assert.rejects(databasePool.query('SELECT 1'),{code:'unsafe_runtime_database_role'});
    const code=`import asyncio,os,sys
sys.path.insert(0,'chatkit_backend')
from database import connect_database
async def main():
 try: await connect_database(os.environ['DATABASE_URL'])
 except Exception as e: assert 'runtime' in str(e).lower() or 'owner' in str(e).lower()
 else: raise AssertionError('factor table owner accepted')
asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy()) if sys.platform=='win32' else None
asyncio.run(main())`;
    assert.equal(spawnSync('.venv/Scripts/python.exe',['-c',code],{encoding:'utf8',env:process.env}).status,0);
   }finally{await db.query('ALTER TABLE public."twoFactor" OWNER TO '+quote(original));await db.query('GRANT SELECT,INSERT,UPDATE,DELETE ON public."twoFactor" TO '+quote(decodeURIComponent(runtime.username)));}
   assert.equal((await databasePool.query('SELECT current_user=session_user clean')).rows[0].clean,true);
  });
  await t.test("account-wide disable and Python checks reject a privileged session; specialist expiry remains independent",async()=>{
   const a=f.accounts.ownerA;
   await db.query("INSERT INTO agency_platform.account_controls(actor,disabled,reason) VALUES($1,true,'Synthetic account revocation')",[a.accountIdentifier]);
   await assert.rejects(databasePool.query("SELECT agency_platform.account_session($1,$2)",[a.accountIdentifier,a.session]),{code:"42501"});
   await db.query("UPDATE agency_platform.account_controls SET disabled=false WHERE actor=$1",[a.accountIdentifier]);
   await db.query("DELETE FROM agency_platform.session_factors WHERE session_id=$1",[a.session]);
   const python=`import asyncio,os,sys
sys.path.insert(0,'chatkit_backend')
from database import connect_database
from workspace_access import session_actor
from types import SimpleNamespace
from fastapi import HTTPException
async def main():
 async with await connect_database(os.environ['DATABASE_URL']) as db:
  try: await session_actor(db,SimpleNamespace(user_id=int(os.environ['TEST_USER']),auth_session_id=os.environ['TEST_SESSION']))
  except HTTPException: pass
  else: raise AssertionError('unassured privileged session allowed')
asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy()) if sys.platform=='win32' else None
asyncio.run(main())`;
   const result=spawnSync('.venv/Scripts/python.exe',['-c',python],{encoding:'utf8',env:{...process.env,TEST_USER:a.id,TEST_SESSION:a.session}});assert.equal(result.status,0,"Python session check failed; inspect private test log.");
   assert.equal((await auth.api.verifyTOTP({body:{code:await otp(a.totpURI)},headers:headers("ownerA"),asResponse:true})).status,200);
   for(const table of ["account_controls","session_factors","invitation_links","account_security_audit"]) await assert.rejects(databasePool.query("SELECT * FROM agency_platform."+table),{code:"42501"});
   const specialist=f.specialists.specialistA;
   await db.query("UPDATE agency_platform.specialist_assignments SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",[f.active[0]]);
   await assert.rejects(databasePool.query("SELECT agency_platform.specialist_scope($1,$2,$3,'delivery.read')",[specialist.accountIdentifier,specialist.session,f.active[0]]),{code:"42501"});
  });
  await writeFile(process.env.ACCOUNT_SECURITY_FIXTURE,JSON.stringify(f),{mode:0o600});
 } finally {await closeAuthDatabase();await db.end();}
});
