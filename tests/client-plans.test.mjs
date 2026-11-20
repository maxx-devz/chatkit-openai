import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {planMutation,planAvailability,planCredits} from '../lib/client-plan-policy.js';
test('Plan price is independent of credits, payment confirmation is explicit and mass-assigned roles are ignored',()=>{
 const input={action:'save',clientId:'4',idempotencyKey:randomUUID(),price:'200',credits:'50000',status:'active',expectedVersion:'0',reason:'Approved plan',activate:true,paymentReference:'TEST-PAID',paymentConfirmed:true,role:'aoc_owner'};
 const value=planMutation(input);assert.equal(value.price,'200.00');assert.equal(value.credits,'50000');assert.equal(value.role,undefined);
 assert.throws(()=>planMutation({...input,paymentConfirmed:false}),/payment/);
 for(const credits of ['abc','1e3','-1','0','1.5','1000000001'])assert.throws(()=>planCredits(credits));
 assert.throws(()=>planMutation({...input,clientId:'999999999999999999999'}));
});
test('Quota states distinguish legacy, paid active, paused, renewal, pending costs and exhausted credits',()=>{
 const ok={configured:true,status:'active',entitled:true,pending:false,remaining:'12.5'};
 assert.equal(planAvailability(ok).canGenerate,true);
 assert.equal(planAvailability({...ok,remaining:'0'}).code,'plan_exhausted');
 assert.equal(planAvailability({...ok,status:'paused'}).code,'plan_paused');
 assert.equal(planAvailability({...ok,entitled:false}).code,'plan_payment_due');
 assert.equal(planAvailability({...ok,pending:true}).code,'plan_pending');
 assert.equal(planAvailability({configured:false}).code,'legacy');
});
async function route(admin,{authorized=true,origin=true}={}){
 const key=randomUUID(),calls=[];const mocks={withAdminAudit:(_operation,handler)=>handler,noteAdminAuditError:()=>{},noteAdminAuditOutcome:()=>{},databasePool:{query:async()=>({rows:[]})},PlanConflict:class extends Error{},
 resolveAdminContext:async()=>{if(!authorized)throw {publicDetails:{status:403}};return {admin:{id:'9'}};},
 requireClientPermission:async(_headers,permission)=>{calls.push({permission});if(!authorized)throw {publicDetails:{status:403}};return {client:{id:'4'},user:{id:'11'}};},
 assertTrustedOrigin:()=>{if(!origin)throw {security:true};},requestSecurityErrorResponse:e=>e.security?Response.json({error:'Denied'},{status:403}):null,
 adminErrorResponse:()=>Response.json({error:'Denied'},{status:403}),portalErrorResponse:()=>Response.json({error:'Denied'},{status:403}),readJsonRequest:r=>r.json(),
 readClientPlan:async(_db,clientId)=>{calls.push({read:clientId});return {clientId};},mutateClientPlan:async(_db,input,actor)=>{calls.push({input,actor});return {ok:true};},
 requestClientPlan:async(_db,clientId,userId,input)=>{calls.push({clientId,userId,input});return {ok:true};}};
 globalThis[key]=mocks;const source=await readFile(new URL(admin?'../app/api/admin/client-plan/route.js':'../app/api/client/plan/route.js',import.meta.url),'utf8');
 try{return {calls,module:await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(mocks).join(',')}}=globalThis[${JSON.stringify(key)}];\n`+source.replace(/^import .*;\r?\n/gm,'')).toString('base64'))};}finally{delete globalThis[key];}
}
test('Client request binds identity to the session and rejects stale workspace IDs and CSRF',async()=>{
 const f=await route(false);const request=(id='4')=>new Request('https://portal.test/api/client/plan',{method:'POST',headers:{'x-aoc-client':id},body:JSON.stringify({clientId:'999',userId:'999',kind:'credits'})});
 assert.equal((await f.module.POST(request('999'))).status,409);
 assert.equal((await f.module.POST(request())).status,200);const call=f.calls.find(row=>row.input);assert.equal(call.clientId,'4');assert.equal(call.userId,'11');
 for(const options of [{authorized:false},{origin:false}])assert.equal((await (await route(false,options)).module.POST(request())).status,403);
});
test('Client and unrelated sessions cannot call admin plan APIs or set the audit actor',async()=>{
 const request=()=>new Request('https://portal.test/api/admin/client-plan',{method:'POST',body:JSON.stringify({clientId:'4',actorId:'evil'})});
 for(const options of [{authorized:false},{origin:false}])assert.equal((await (await route(true,options)).module.POST(request())).status,403);
 const f=await route(true);const response=await f.module.POST(request());assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(f.calls[0].actor,'9');
});
