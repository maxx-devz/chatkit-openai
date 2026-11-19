import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';
import {createAgencyReviewFixture} from '../../scripts/agency-review-fixture.mjs';

test('Stage 13 agency administration boundaries',{skip:!process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL},async t=>{
 const url=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL),runtime=new URL(process.env.DATABASE_URL),origin=process.env.BETTER_AUTH_URL;
 assert.equal(url.hostname,'127.0.0.1');assert.match(url.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);assert.equal(url.host,runtime.host);assert.equal(url.pathname,runtime.pathname);assert.notEqual(url.username,runtime.username);
 const db=new pg.Client({connectionString:url.href});await db.connect();
 const {createPortalAuth,closeAuthDatabase}=await import('../../lib/auth.js');
 const {databasePool}=await import('../../lib/database.js');
 const api=await import('../../app/api/admin/agency/route.js'),inbox=await import('../../app/api/admin/agency/invitations/route.js');
 const auth=createPortalAuth({allowAccountCreation:true,useNextCookies:false});
 let f;
 try{
  f=await createAgencyReviewFixture(db,auth,origin);
  for(const a of Object.values(f.accounts)){
   const response=await auth.api.signInUsername({body:{username:a.username,password:a.password},headers:new Headers({origin}),asResponse:true});assert.equal(response.status,200);
   a.cookie=response.headers.getSetCookie().map(x=>x.split(';')[0]).join('; ');
   a.session=(await db.query('SELECT id FROM "session" WHERE "userId"=$1 ORDER BY "createdAt" DESC LIMIT 1',[a.accountIdentifier])).rows[0].id;
  }
  const [A,B]=f.agencies,[A1,A2,B1,B2]=f.clients;
  // Exercise SQL directly first so a function compilation failure is visible
  // in the private test log instead of being hidden by sanitized API errors.
  await databasePool.query('SELECT agency_platform.agency_admin_view($1,$2,$3,$4)',[f.accounts.ownerA.accountIdentifier,f.accounts.ownerA.session,A.id,'']);
  const headers=(key,extra={})=>new Headers({origin,host:new URL(origin).host,'content-type':'application/json',cookie:f.accounts[key].cookie,...extra});
  const req=(key,agency,body,extra={})=>new Request(origin+'/api/admin/agency?agency='+agency.slug,{method:body?'POST':'GET',headers:headers(key,extra),...(body?{body:JSON.stringify(body)}:{})});
  const read=async(key,agency)=>{const response=await api.GET(req(key,agency));assert.equal(response.status,200);return response.json();};
  const change=async(key,agency,body)=>{const d=await read(key,agency);return api.POST(req(key,agency,{revision:d.revision,operation:randomUUID(),reason:'Synthetic local check',...body}));};
  const invitation=async(key,body)=>inbox.POST(new Request(origin+'/api/admin/agency/invitations',{method:'POST',headers:headers(key),body:JSON.stringify(body)}));
  await t.test('two agencies see only their own clients/staff/settings/usage/audit; delivery is assigned-client only',async()=>{
   for(const [key,agency,own,foreign,support,tokens,cost] of [['ownerA',A,A1,B1,'S13_A_SUPPORT',20,.12],['ownerB',B,B1,A1,'S13_B_SUPPORT',80,99]]){
    const d=await read(key,agency);assert.equal(d.clients.length,2);assert.ok(d.clients.some(c=>c.id===own.id));assert.ok(!d.clients.some(c=>c.id===foreign.id));assert.equal(d.settings.supportName,support);assert.equal(Number(d.usage.tokens),tokens);assert.equal(Number(d.usage.costs.usd),cost);
    assert.ok(d.audit.every(e=>e.clientId===null||d.clients.some(c=>c.id===e.clientId)));assert.doesNotMatch(JSON.stringify(d),/PRIVATE_ADMIN|encrypted_|api_key|AGENCY_A_ONLY|S11_CANARY/);
   }
   const staff=await read('staffA',A);assert.deepEqual(staff.clients.map(c=>c.id),[A1.id]);assert.equal(staff.members.length,1);assert.equal(staff.usage.costs,null);assert.ok(!staff.audit.some(e=>e.reason==='S13_A2_AUDIT'));
   assert.equal((await read('adminA',A)).usage.costs,null);
   assert.equal((await api.GET(req('ownerA',B))).status,403);assert.equal((await api.GET(req('ownerB',A))).status,403);
   for(const key of ['clientA','platformOnly','unrelated'])assert.equal((await api.GET(req(key,A))).status,403);
  });
  await t.test('local review gate, host/origin and explicit workspace selectors fail closed',async()=>{
   const saved=process.env.LOCAL_AGENCY_ADMIN_REVIEW;delete process.env.LOCAL_AGENCY_ADMIN_REVIEW;
   assert.equal((await api.GET(req('ownerA',A))).status,404);process.env.LOCAL_AGENCY_ADMIN_REVIEW=saved;
   const databaseUrl=process.env.DATABASE_URL;process.env.DATABASE_URL='postgresql://synthetic:synthetic@example.invalid/aoc_stage04_rehearsal_123';
   assert.equal((await api.GET(req('ownerA',A))).status,404);process.env.DATABASE_URL=databaseUrl;
   assert.equal((await api.GET(req('ownerA',A,undefined,{host:'foreign.invalid'}))).status,403);
   assert.equal((await api.GET(req('multi',B,undefined,{'x-aoc-agency-admin':A.id}))).status,409);
   const d=await read('ownerA',A);
   assert.equal((await api.POST(req('ownerA',A,{action:'client.create',slug:'bad-origin',name:'No write',revision:d.revision,operation:randomUUID(),reason:'Bad origin'},{origin:'https://foreign.invalid'}))).status,403);
  });
  await t.test('client creation/update are owned, idempotent and reject foreign IDs and mass assignment',async()=>{
   const before=(await db.query('SELECT count(*)::int n FROM portal_clients')).rows[0].n;
   const d=await read('ownerA',A),command={action:'client.create',slug:'s13-created',name:'Harbor Created Client',revision:d.revision,operation:randomUUID(),reason:'Create local client'};
   const response=await api.POST(req('ownerA',A,command));assert.equal(response.status,200);const result=await response.json();f.createdClient=result.clientId;
   assert.equal((await api.POST(req('ownerA',A,command))).status,200);assert.equal((await db.query('SELECT count(*)::int n FROM portal_clients')).rows[0].n,before+1);
   assert.equal((await db.query('SELECT agency_id::text FROM agency_platform.client_ownership WHERE client_id=$1',[result.clientId])).rows[0].agency_id,A.id);
   assert.equal((await db.query("SELECT scope_kind FROM agency_platform.legacy_ownership WHERE relation_name='portal_clients' AND record_key=jsonb_build_object('id',$1::text)",[result.clientId])).rows[0].scope_kind,'client');
   assert.equal((await change('ownerA',A,{action:'client.create',slug:'mass-assignment',name:'Invalid',agencyId:B.id})).status,400);
   const edit={action:'client.update',clientId:B1.id,name:'Foreign changed',portalEnabled:false,aiEnabled:false,approvedWebsiteUrl:'',hubstaffProjectUrl:''};
   assert.equal((await change('ownerA',A,edit)).status,403);assert.equal((await change('staffA',A,{...edit,clientId:A1.id})).status,403);
   assert.equal((await db.query('SELECT display_name FROM portal_clients WHERE id=$1',[B1.id])).rows[0].display_name,B1.name);
   assert.equal((await change('adminA',A,{...edit,clientId:result.clientId,name:'Harbor Updated Client',portalEnabled:true})).status,200);
  });
  await t.test('owner settings, lower staff role and client membership cannot escalate to agency/platform authority',async()=>{
   const settings={action:'settings.update',supportName:'Harbor Support revised',supportEmail:'support@example.invalid',timezone:'UTC'};
   assert.equal((await change('adminA',A,settings)).status,403);assert.equal((await change('ownerA',A,settings)).status,200);
   assert.equal((await change('adminA',A,{action:'member.update',userId:f.accounts.staffA.id,role:'agency_admin',active:true})).status,403);
   assert.equal((await change('ownerA',A,{action:'member.update',userId:f.accounts.staffA.id,role:'owner',active:true})).status,403);
   assert.equal((await change('ownerA',A,{action:'client.access',clientId:A1.id,userId:f.accounts.staffB.id,clientRole:'member',active:true})).status,403);
   assert.equal((await change('ownerA',A,{action:'client.access',clientId:A2.id,userId:f.accounts.clientA.id,clientRole:'client_admin',active:true})).status,200);
   assert.equal((await change('ownerA',A,{action:'client.access',clientId:A1.id,userId:f.accounts.clientA.id,clientRole:'member',active:false})).status,403);
   assert.equal((await api.GET(req('clientA',A))).status,403);
   assert.equal((await db.query('SELECT count(*)::int n FROM agency_platform.platform_memberships WHERE user_id=$1',[f.accounts.staffA.id])).rows[0].n,0);
  });
  await t.test('local invitations require recipient consent, obey inviter authority and reject foreign/duplicate memberships',async()=>{
   const invite={action:'invite.create',account:f.accounts.invitee.accountIdentifier,role:'staff'};
   assert.equal((await change('adminA',A,{...invite,role:'agency_admin'})).status,403);
   assert.equal((await change('ownerA',A,{...invite,role:'client_user',clientId:B1.id,clientRole:'client_admin'})).status,403);
   const d=await read('ownerA',A),operation=randomUUID();
   assert.equal((await api.POST(req('ownerA',A,{...invite,operation,revision:d.revision,reason:'Synthetic invitation'}))).status,200);
   assert.equal((await change('ownerA',A,invite)).status,409);
   assert.equal((await invitation('unrelated',{id:operation})).status,403);
   assert.equal((await invitation('invitee',{id:operation})).status,200);
   assert.equal((await invitation('invitee',{id:operation})).status,403);
   assert.equal((await change('ownerA',A,invite)).status,400);
   assert.equal((await read('invitee',A)).actor.role,'staff');
   const d2=await read('ownerB',B),op2=randomUUID();
   assert.equal((await api.POST(req('ownerB',B,{...invite,operation:op2,revision:d2.revision,reason:'Cross agency consent'}))).status,200);
   assert.equal((await api.GET(req('invitee',B))).status,403);
   assert.equal((await invitation('invitee',{id:op2})).status,200);assert.equal((await read('invitee',B)).actor.role,'staff');
  });
  await t.test('expired/revoked invitations and stale inviter authority cannot activate access',async()=>{
   const account=f.accounts.unrelated.accountIdentifier;
   for(const mode of ['expiry','revoked','downgraded']){
    const d=await read('adminA',A),operation=randomUUID();
    assert.equal((await api.POST(req('adminA',A,{action:'invite.create',account,role:'staff',revision:d.revision,operation,reason:'Synthetic pending '+mode}))).status,200);
    if(mode==='expiry')await db.query("UPDATE agency_platform.agency_invitations SET expires_at=now()-interval '1 minute' WHERE id=$1",[operation]);
    if(mode==='revoked')assert.equal((await change('adminA',A,{action:'invite.revoke',invitationId:operation})).status,200);
    if(mode==='downgraded')assert.equal((await change('ownerA',A,{action:'member.update',userId:f.accounts.adminA.id,role:'staff',active:true})).status,200);
    assert.equal((await invitation('unrelated',{id:operation})).status,403);
    await db.query("UPDATE agency_platform.agency_invitations SET status='revoked' WHERE id=$1",[operation]);
   }
   assert.equal((await read('adminA',A)).actor.role,'staff');
   assert.equal((await change('ownerA',A,{action:'member.update',userId:f.accounts.adminA.id,role:'agency_admin',active:true})).status,200);
  });
  await t.test('last-owner protection applies to API and database; ownership transfer is atomic and scoped',async()=>{
   assert.equal((await change('ownerA',A,{action:'member.update',userId:f.accounts.ownerA.id,role:'staff',active:false})).status,403);
   await assert.rejects(db.query('UPDATE agency_platform.memberships SET is_active=false WHERE agency_id=$1 AND user_id=$2',[A.id,f.accounts.ownerA.id]),{code:'23514'});
   await assert.rejects(db.query('DELETE FROM agency_platform.agency_governance WHERE agency_id=$1',[A.id]),{code:'23514'});
   assert.equal((await change('ownerA',A,{action:'owner.transfer',userId:f.accounts.ownerB.id,confirmation:A.slug})).status,403);
   assert.equal((await change('ownerA',A,{action:'owner.transfer',userId:f.accounts.adminA.id,confirmation:A.slug})).status,200);
   assert.equal((await read('ownerA',A)).actor.isOwner,false);assert.equal((await read('adminA',A)).actor.isOwner,true);
   assert.equal((await change('ownerA',A,{action:'settings.update',supportName:'forbidden',supportEmail:'',timezone:'UTC'})).status,403);
   assert.equal((await change('adminA',A,{action:'owner.transfer',userId:f.accounts.ownerA.id,confirmation:A.slug})).status,200);
  });
  await t.test('revocation/downgrade, suspension and stale sessions are rechecked; denied work leaves no partial writes',async()=>{
   assert.equal((await change('ownerA',A,{action:'member.update',userId:f.accounts.staffA.id,role:'staff',active:false})).status,200);
   assert.equal((await api.GET(req('staffA',A))).status,403);assert.equal((await read('multi',B)).agency.id,B.id);
   assert.equal((await change('ownerA',A,{action:'member.update',userId:f.accounts.staffA.id,role:'staff',active:true})).status,200);
   assert.equal((await read('staffA',A)).clients.length,0,'Reactivation cannot restore old client grants');
   assert.equal((await change('ownerA',A,{action:'client.access',clientId:A1.id,userId:f.accounts.staffA.id,clientRole:'member',active:true})).status,200);
   await db.query('UPDATE agency_platform.agencies SET is_active=false WHERE id=$1',[B.id]);assert.equal((await api.GET(req('ownerB',B))).status,403);await db.query('UPDATE agency_platform.agencies SET is_active=true WHERE id=$1',[B.id]);
   await db.query('UPDATE "session" SET "expiresAt"=now()-interval \'1 second\' WHERE id=$1',[f.accounts.unrelated.session]);assert.equal((await api.GET(req('unrelated',A))).status,401);
   const before=(await db.query('SELECT count(*)::int n FROM agency_platform.agency_admin_audit')).rows[0].n;
   const d=await read('ownerA',A);assert.equal((await api.POST(req('ownerA',A,{action:'client.create',slug:'stale-client',name:'Stale',revision:'0',operation:randomUUID(),reason:'Stale attempt'}))).status,409);
   assert.equal((await db.query('SELECT count(*)::int n FROM agency_platform.agency_admin_audit')).rows[0].n,before);
   assert.equal((await read('ownerA',A)).revision,d.revision);
  });
  await t.test('protected ledgers and pooled runtime do not carry prior agency privilege',async()=>{
   for(const table of ['agency_governance','agency_admin_audit','agency_invitations']){
    await assert.rejects(databasePool.query('SELECT * FROM agency_platform.'+table),{code:'42501'});
    await assert.rejects(databasePool.query('DELETE FROM agency_platform.'+table),{code:'42501'});
   }
   await read('ownerA',A);assert.equal((await api.GET(req('ownerB',A))).status,403);assert.equal((await databasePool.query('SELECT current_user=session_user clean')).rows[0].clean,true);
  });
  await t.test('concurrent changes serialize with one accepted revision and no partial second write',async()=>{
   const d=await read('ownerA',A),base={action:'client.create',name:'Concurrent client',revision:d.revision,reason:'Synthetic concurrent check'};
   const responses=await Promise.all(['one','two'].map(slug=>api.POST(req('ownerA',A,{...base,slug:'s13-concurrent-'+slug,operation:randomUUID()}))));
   assert.deepEqual(responses.map(r=>r.status).sort(),[200,409]);
   assert.equal((await db.query("SELECT count(*)::int n FROM portal_clients WHERE slug LIKE 's13-concurrent-%'")).rows[0].n,1);
  });
  assert.match(process.env.AGENCY_ADMIN_FIXTURE.replaceAll('\\','/'),/\/\.tmp\/.+\/agency-admin-fixture\.json$/);
  await writeFile(process.env.AGENCY_ADMIN_FIXTURE,JSON.stringify(f),{mode:0o600});
 }finally{await closeAuthDatabase();await db.end();}
});
