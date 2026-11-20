import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {usageClearScope,usageClearPreview,verifyUsageClearPreview} from '../lib/ai-usage-clear-policy.js';
const secret='synthetic-only-signing-secret-at-least-32',now=Date.parse('2026-11-17T06:00:00Z');
test('Clear scopes and periods are explicit, bounded and independent of tenant IDs sent with confirmation',()=>{
  assert.deepEqual(usageClearScope({scope:'client',clientId:'2',period:'2026-10'},now),
    {scope:'client',clientId:'2',period:'2026-10',action:'client_ai.reply',start:'2026-10-01T00:00:00.000Z',end:'2026-11-01T00:00:00.000Z'});
  assert.equal(usageClearScope({scope:'admin',period:'all'},now).start,null);
  for(const input of [{},{scope:'everybody'},{scope:'client',clientId:'0'},{scope:'client',clientId:'9223372036854775808'},
    {scope:'clients',clientId:'1'},{scope:'admin',period:'2026-12'},{scope:'clients',period:'2026-99'}])
    assert.throws(()=>usageClearScope(input,now),TypeError);
});
test('Signed clear previews reject actor changes, tampering and expiration and retain the original cutoff',()=>{
  const {plan,token}=usageClearPreview({scope:'client',clientId:'1',period:'all'},'9',secret,now);
  assert.deepEqual(verifyUsageClearPreview(token,'9',secret,now+1000),plan);
  for(const [value,actor,time] of [[token+'x','9',now],[token,'10',now],[token,'9',now+601000],['bad','9',now]])
    assert.throws(()=>verifyUsageClearPreview(value,actor,secret,time),TypeError);
});
async function route({authorized=true,origin=true}={}) {
  const calls=[],key=randomUUID();
  const mocks={withAdminAudit:(_operation,handler)=>handler,noteAdminAuditError:()=>{},noteAdminAuditOutcome:()=>{},resolveAdminContext:async()=>{if(!authorized)throw {publicDetails:{status:403}};return {admin:{id:'9'}};},
    adminErrorResponse:()=>Response.json({error:'Denied'},{status:403}),
    assertTrustedOrigin:()=>{if(!origin)throw {security:true};},
    requestSecurityErrorResponse:e=>e.security?Response.json({error:'Origin denied'},{status:403}):null,
    readJsonRequest:r=>r.json(),databasePool:{},
    previewAiUsageClear:async(_db,input,actor)=>{calls.push({input,actor});return {token:'fixture',requests:3,costEvents:2,knownUsd:'0.25'};},
    verifyUsageClearPreview:(token,actor)=>{calls.push({verify:true,token,actor});if(token!=='fixture')throw new TypeError('Preview again');return {actorId:actor,clientId:'1'};},
    clearAiUsageHistory:async(_db,plan)=>{calls.push({clear:true,plan});return {cleared:3,costsCleared:2};}};
  globalThis[key]=mocks;
  try {
    const source=await readFile(new URL('../app/api/admin/ai-usage/history/route.js',import.meta.url),'utf8');
    return {calls,module:await import('data:text/javascript;base64,'+Buffer.from(
      'const {'+Object.keys(mocks).join(',')+'}=globalThis['+JSON.stringify(key)+'];\n'+source.replace(/^import .*;\r?\n/gm,'')).toString('base64'))};
  }finally{delete globalThis[key];}
}
const req=body=>new Request('https://portal.test/api/admin/ai-usage/history',{method:'POST',body:JSON.stringify(body)});
test('Clients and untrusted origins cannot preview or clear any usage or dollar records',async()=>{
  for(const options of [{authorized:false},{origin:false}]) {
    const f=await route(options);
    for(const action of ['preview','clear'])assert.equal((await f.module.POST(req({action,confirmation:'RESET',token:'fixture'}))).status,403);
    assert.equal(f.calls.length,0);
  }
});
test('Clear requires typed confirmation and a verified preview; forged scope and actor are ignored',async()=>{
  const f=await route();
  assert.equal((await f.module.POST(req({action:'clear',confirmation:'clear',token:'fixture'}))).status,400);
  assert.equal(f.calls.length,0);
  assert.equal((await f.module.POST(req({action:'clear',confirmation:'RESET',token:'bad'}))).status,400);
  assert.ok(!f.calls.some(call=>call.clear));
  const response=await f.module.POST(req({action:'clear',confirmation:'RESET',token:'fixture',clientId:'999',actorId:'999'}));
  assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'private, no-store');
  assert.deepEqual(f.calls.at(-1).plan,{actorId:'9',clientId:'1'});
  assert.equal((await f.module.POST(req(null))).status,400);
});
