import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile,readdir} from 'node:fs/promises';
import {auditInput,auditLocation,validateBrowserAudit,safeAuditCode} from '../lib/admin-audit-policy.js';
import {createAdminAuditedHandler} from '../lib/admin-operation-runner.js';
import {authorizeAdminAudit,noteAdminAuditError,noteAdminAuditOutcome,noteAdminAuditClient,noteAdminAuditSaved} from '../lib/admin-audit-context.js';
const admin={id:'1',name:'Synthetic Operator'},request=()=>new Request('http://portal.test/api/admin/clients',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({clientId:'2',name:'Secret name',password:'sk-secret',messages:['private prompt'],price:'200',credits:'5000',portalEnabled:true})});
test('Audit metadata excludes private input, cookies, URLs and arbitrary codes; locations exclude messages and machine paths',()=>{
 const value=auditInput({clientId:'999999999999999999999',password:'secret',instructions:'private',apiKey:'sk-secret',reason:'Private financial reason',price:'200',credits:'6000',portalEnabled:true,role:'admin'},'/api/admin/clients','POST');
 assert.deepEqual(value.values,{portalEnabled:true,price:'200',credits:'6000'});assert.equal(value.requested_client_id,null);assert.ok(!JSON.stringify(value).includes('sk-secret'));assert.ok(!value.fields.includes('apiKey'));assert.equal(safeAuditCode('sk-private-key'),'unexpected_failure');
 assert.equal(auditLocation('Error: SECRET\n at fn (C:\\Users\\Private\\project\\lib\\example.js:12:8)'),'/lib/example.js:12:8');
 const event=validateBrowserAudit({events:[{id:randomUUID(),type:'ui.field_change',fieldType:'password',value:'secret',actor:'forged',route:'/admin?token=secret'}]})[0];assert.equal(event.route,'/admin');assert.ok(!JSON.stringify(event).includes('secret'));assert.equal(event.actor,undefined);
 assert.throws(()=>validateBrowserAudit({events:Array(26).fill({})}));assert.throws(()=>validateBrowserAudit({events:[{id:randomUUID(),type:'server.succeeded'}]}));
});
test('The durable start precedes mutation, verified actor is used, and input is still readable by handler',async()=>{
 const events=[],order=[];const handler=createAdminAuditedHandler('admin.clients',async req=>{await Promise.all([authorizeAdminAudit(admin),authorizeAdminAudit(admin)]);order.push('write');assert.equal((await req.json()).password,'sk-secret');return Response.json({ok:true});},{append:async e=>{events.push(e);order.push(e.phase);}});
 const response=await handler(request());assert.equal(response.status,200);assert.deepEqual(order,['started','write','finished']);assert.equal(events[1].outcome,'succeeded');assert.equal(events[1].actor.id,'1');assert.equal(events[1].clientId,'2');assert.ok(!JSON.stringify(events).includes('sk-secret'));assert.match(response.headers.get('x-aoc-audit-reference'),/^[a-f0-9-]{36}$/);assert.match(response.headers.get('cache-control'),/no-store/);
});
test('Unavailable start audit prevents the protected mutation; completed action is never falsely reported as failed when completion recording fails',async()=>{
 let writes=0;const events=[];const handler=createAdminAuditedHandler('admin.clients',async()=>{try{await authorizeAdminAudit(admin);writes++;return Response.json({ok:true});}catch(e){return Response.json({code:e.publicDetails.code},{status:503});}},{append:async e=>{events.push(e);throw Error('Database unavailable');}});
 assert.equal((await handler(request())).status,503);assert.equal(writes,0);
 const alerts=[];const completed=createAdminAuditedHandler('admin.clients',async()=>{await authorizeAdminAudit(admin);writes++;return Response.json({ok:true});},{append:async e=>{if(e.phase==='finished')throw Error('offline');},report:e=>alerts.push(e)});
 const response=await completed(request());assert.equal(response.status,200);assert.equal(response.headers.get('x-aoc-audit-status'),'incomplete');assert.equal(writes,1);assert.equal(alerts.length,1);
});
test('Denied requests do not acquire an admin identity; safe SQL errors have code and source without SQL or message',async()=>{
 let events=[];const denied=createAdminAuditedHandler('admin.clients',async()=>Response.json({error:'Forbidden'},{status:403}),{append:async e=>events.push(e)});await denied(request());assert.equal(events.length,1);assert.equal(events[0].actor,null);assert.equal(events[0].outcome,'denied');
 events=[];const failed=createAdminAuditedHandler('admin.clients',async()=>{await authorizeAdminAudit(admin);const error=new Error('SECRET SQL password');error.code='23505';error.stack='SECRET\n at write (/lib/clients.js:45:2)';noteAdminAuditError(error);return Response.json({error:'Unavailable'},{status:409});},{append:async e=>events.push(e)});await failed(request());assert.equal(events[1].code,'23505');assert.equal(events[1].location,'/lib/clients.js:45:2');assert.ok(!JSON.stringify(events).includes('SECRET'));
});
test('Concurrent requests never reuse the preceding actor or client context',async()=>{
 const events=[];const handler=createAdminAuditedHandler('admin.clients',async req=>{const id=new URL(req.url).searchParams.get('actor');await authorizeAdminAudit({id,name:'Synthetic'});await new Promise(resolve=>setTimeout(resolve,id==='1'?5:1));noteAdminAuditError({code:id==='1'?'23505':'23503'});return Response.json({ok:false},{status:409});},{append:async e=>events.push(e)});
 await Promise.all(['1','2'].map(id=>handler(new Request('http://portal.test/api/admin/clients?actor='+id,{method:'POST'}))));for(const event of events.filter(e=>e.phase==='finished'))assert.equal(event.code,event.actor.id==='1'?'23505':'23503');
});
test('Streams record a final error after draining instead of recording HTTP 200 as success; cancellation is distinct',async()=>{
 const events=[];const handler=createAdminAuditedHandler('admin.assistant',async()=>{await authorizeAdminAudit(admin);return new Response('data: {"type":"delta","delta":"PRIVATE ANSWER"}\n\ndata: {"type":"error","message":"SECRET"}\n\n',{headers:{'content-type':'text/event-stream'}});},{append:async e=>events.push(e)});
 const response=await handler(request());assert.equal(events.length,1);assert.match(await response.text(),/PRIVATE ANSWER/);assert.equal(events[1].outcome,'failed');assert.equal(events[1].code,'stream_error');assert.ok(!JSON.stringify(events).includes('PRIVATE ANSWER'));
 const other=[];const cancelled=createAdminAuditedHandler('admin.assistant',async()=>{await authorizeAdminAudit(admin);return new Response(new ReadableStream({pull(){}}),{headers:{'content-type':'text/event-stream'}});},{append:async e=>other.push(e)});await (await cancelled(request())).body.cancel();assert.equal(other.at(-1).outcome,'cancelled');
});
test('Coverage manifest includes every admin/builder route method, with only telemetry transport excluded',async()=>{
 const manifest=JSON.parse(await readFile(new URL('../config/admin-audit-coverage.json',import.meta.url),'utf8'));
 async function routes(path){const result=[];for(const file of await readdir(path,{withFileTypes:true})){if(file.isDirectory())result.push(...await routes(new URL(file.name+'/',path)));else if(file.name==='route.js')result.push(new URL(file.name,path));}return result;}
 for(const file of [...await routes(new URL('../app/api/admin/',import.meta.url)),...await routes(new URL('../app/api/builder/',import.meta.url))]){
  const path='/'+file.pathname.split('/app/')[1].replace('/route.js','');if(path==='/api/admin/audit-events')continue;const source=await readFile(file,'utf8'),entry=manifest.find(e=>e.route===path);assert.ok(entry,path);assert.match(entry.operation,/^[a-z][a-z0-9_.]{0,95}$/);for(const method of entry.methods)assert.ok(source.includes(`export const ${method}=withAdminAudit(`),path+' '+method);
 }
});

test('OAuth failure/cancellation redirects retain their actual outcome and client changes bind to an authorized result',async()=>{
 for(const result of ['failed','cancelled']){const events=[];const handler=createAdminAuditedHandler('admin.oauth.callback',async()=>{await authorizeAdminAudit(admin);noteAdminAuditOutcome(result,result==='cancelled'?'request_cancelled':'provider_error');noteAdminAuditClient('2');return Response.redirect('http://portal.test/admin/sources?connection=failed',303);},{append:async e=>events.push(e)});const response=await handler(request());assert.equal(response.status,303);assert.equal(events.at(-1).outcome,result);assert.equal(events.at(-1).clientId,'2');}
});

test('Ordinary GET reads and pure previews do not create any audit record or require audit storage',async()=>{
 for(const path of ['/api/admin/ai-usage','/api/admin/ai-spending','/api/admin/presence','/api/admin/clients','/api/admin/audit']){
  let called=0;const handler=createAdminAuditedHandler('admin.read',async()=>{await authorizeAdminAudit({id:'1'});called++;return Response.json({ready:true});},{append:async()=>{throw Error('Must not audit a read');}});const response=await handler(new Request('http://portal.test'+path));assert.equal(response.status,200);assert.equal(called,1);assert.equal(response.headers.get('x-aoc-audit-reference'),null);
 }
 for(const [path,action] of [['/api/admin/provider-settings',null],['/api/admin/credits','preview'],['/api/admin/credits','adjustment_preview'],['/api/admin/ai-usage/history','preview']]){
  const handler=createAdminAuditedHandler('admin.preview',async()=>Response.json({preview:true}),{append:async()=>{throw Error('Must not audit a preview');}});assert.equal((await handler(new Request('http://portal.test'+path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action})}))).status,200);
 }
});
test('OAuth GET callbacks still require a durable audit because they change credential grants',async()=>{
 let changes=0;const handler=createAdminAuditedHandler('admin.oauth.callback',async()=>{try{await authorizeAdminAudit({id:'1'});changes++;return Response.json({ok:true});}catch{return Response.json({error:'Unavailable'},{status:503});}},{append:async()=>{throw Error('Offline');}});assert.equal((await handler(new Request('http://portal.test/api/admin/source-connections/callback'))).status,503);assert.equal(changes,0);
});
test('Legacy browser batch entry point no longer persists events',async()=>{
 const {appendBrowserOperations}=await import('../lib/admin-operation-store.js');const response=await appendBrowserOperations({query:()=>{throw Error('No browser inserts');}},admin,{events:[{id:randomUUID(),type:'ui.navigate'}]});assert.deepEqual(response,{accepted:0,disabled:true});
});
test('Submitted and committed values are separate, and known secrets/free-text are excluded even after commit',async()=>{
 const events=[];const handler=createAdminAuditedHandler('admin.clients',async()=>{await authorizeAdminAudit(admin);noteAdminAuditSaved({name:'Acme',price:'200.00',credits:'1000',portalEnabled:true,password:'PRIVATE-PASSWORD',apiKey:'sk-private',instructions:'PRIVATE DOCUMENT'});return Response.json({ok:true});},{append:async e=>events.push(e)});
 await handler(new Request('http://portal.test/api/admin/clients',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Acme',price:'200',credits:'1000',password:'PRIVATE-PASSWORD',apiKey:'sk-private',instructions:'PRIVATE DOCUMENT'})}));
 const row=events.at(-1);assert.equal(row.details.values.price,'200');assert.equal(row.details.saved_values.price,'200.00');assert.equal(row.details.saved_values.name,'Acme');assert.ok(!JSON.stringify(events).includes('PRIVATE-PASSWORD'));assert.ok(!JSON.stringify(events).includes('sk-private'));assert.ok(!JSON.stringify(events).includes('PRIVATE DOCUMENT'));assert.ok(row.details.omitted_fields.includes('password'));assert.equal(row.summary,'Client settings updated.');
});
test('Safe value allowlist protects URLs, unknown properties, nested instructions and oversized metadata',async()=>{
 const {safeChangeValues,boundedChangeDetails,isAdminChangeRequest}=await import('../lib/admin-change-policy.js');
 const values=safeChangeValues({name:'Acme',approvedWebsiteUrl:'https://example.com/private?token=PRIVATE',hubstaffProjectUrl:'https://app.hubstaff.com/projects/42?secret=PRIVATE',password:'PRIVATE',paymentReference:'PRIVATE',email:'PRIVATE@example.com',unknown:'PRIVATE',config:{fileSearch:true,instructions:'PRIVATE',knowledge:'PRIVATE',accent:'#123456'}});
 assert.equal(values.websiteDomain,'https://example.com');assert.equal(values.hubstaffProject,'https://app.hubstaff.com/projects/42');assert.equal(values['assistant.fileSearch'],true);assert.equal(safeChangeValues({hubstaffProjectUrl:'https://app.hubstaff.com/reset-password/PRIVATE'}).hubstaffProject,undefined);assert.ok(!JSON.stringify(values).includes('PRIVATE'));
 assert.ok(!Object.keys(safeChangeValues({name:'sk-proj-PRIVATE'})).length);assert.equal(isAdminChangeRequest('/api/admin/clients','PATCH'),true);assert.equal(isAdminChangeRequest('/api/admin/clients','DELETE'),true);assert.equal(isAdminChangeRequest('/api/admin/clients','PUT'),true);
 assert.ok(new TextEncoder().encode(JSON.stringify(boundedChangeDetails({values:{large:'x'.repeat(10000)}}))).length<8192);
});

test('Plan values are confirmed saved only after COMMIT; rollback never labels input as committed',async()=>{
 const {mutateClientPlan}=await import('../lib/client-plan-store.js');
 for(const failCommit of [true,false]){const events=[];const db={release(){},async query(sql){if(sql==='COMMIT'&&failCommit)throw Error('Commit failed');if(sql.includes('SELECT user_id FROM portal_admins'))return {rows:[{user_id:'1'}]};if(sql.includes('SELECT id FROM portal_clients'))return {rows:[{id:'2'}]};if(sql.includes('INSERT INTO portal_client_plans('))return {rows:[{monthly_price:'150.00',monthly_credits:'1000',status:'active'}]};return {rows:[]};}};
  const handler=createAdminAuditedHandler('admin.client_plan',async()=>{try{await authorizeAdminAudit(admin);await mutateClientPlan({connect:async()=>db},{action:'save',clientId:'2',idempotencyKey:randomUUID(),price:'150',credits:'1000',status:'active',expectedVersion:'0',activate:false,reason:'Synthetic approval'},'1');return Response.json({ok:true});}catch{return Response.json({error:'Could not save'},{status:503});}},{append:async e=>events.push(e)});
  await handler(new Request('http://portal.test/api/admin/client-plan',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'save',price:'150',credits:'1000'})}));const final=events.at(-1);if(failCommit){assert.equal(final.outcome,'failed');assert.equal(final.details.saved_values,undefined);}else{assert.equal(final.details.saved_values.price,'150.00');assert.equal(final.details.saved_values.credits,'1000');}
 }
});

test('A request failure after a confirmed commit reports the saved values explicitly',async()=>{
 const events=[];const handler=createAdminAuditedHandler('admin.clients',async()=>{await authorizeAdminAudit(admin);noteAdminAuditSaved({name:'Acme',portalEnabled:false});return Response.json({error:'Refresh failed'},{status:503});},{append:async e=>events.push(e)});await handler(request());const final=events.at(-1);assert.equal(final.outcome,'failed');assert.equal(final.details.saved_values.portalEnabled,false);assert.match(final.summary,/Some values were saved/);
});
