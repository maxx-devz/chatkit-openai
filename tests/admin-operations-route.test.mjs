import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
async function endpoint({authorized=true,trusted=true}={}){
 const calls=[],key=randomUUID(),mocks={databasePool:{},resolveAdminContext:async()=>{if(!authorized)throw {publicDetails:{status:403}};return {admin:{id:'1',name:'Synthetic Operator'}};},adminErrorResponse:()=>Response.json({error:'Forbidden'},{status:403}),assertTrustedOrigin:()=>{if(!trusted)throw {security:true};},requestSecurityErrorResponse:e=>e.security?Response.json({error:'Untrusted origin'},{status:403}):null,readJsonRequest:r=>r.json(),readAdminOperations:async(_db,query)=>{calls.push({read:query});return {ready:true,rows:[]};},appendBrowserOperations:async(_db,admin,input)=>{calls.push({actor:admin.id,input});return {accepted:input.events.length};}};
 const source=await readFile(new URL('../app/api/admin/audit-events/route.js',import.meta.url),'utf8');globalThis[key]=mocks;try{return {calls,module:await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(mocks).join(',')}}=globalThis[${JSON.stringify(key)}];\n`+source.replace(/^import .*;\r?\n/gm,'')).toString('base64'))};}finally{delete globalThis[key];}
}
test('Non-admin audit reads and activity submissions are denied before any database access',async()=>{
 for(const method of ['GET','POST']){const f=await endpoint({authorized:false});const response=await f.module[method](new Request('http://portal.test/api/admin/audit-events',{method,...(method==='POST'?{body:'{"events":[]}'}:{})}));assert.equal(response.status,403);assert.match(response.headers.get('cache-control'),/private, no-store/);assert.equal(f.calls.length,0);assert.doesNotMatch(await response.text(),/Synthetic|request_id|actor/);}
});
test('Untrusted origins cannot write browser events, even with an admin session',async()=>{
 const f=await endpoint({trusted:false});assert.equal((await f.module.POST(new Request('http://portal.test/api/admin/audit-events',{method:'POST',body:'{"events":[]}'}))).status,403);assert.equal(f.calls.length,0);
});
test('Retired browser telemetry stores nothing, and authorized audit reads stay private/no-store',async()=>{
 const f=await endpoint();const response=await f.module.POST(new Request('http://portal.test/api/admin/audit-events',{method:'POST',body:JSON.stringify({actor:'999',events:[{id:randomUUID(),type:'ui.navigate'}]})}));assert.equal(response.status,200);assert.equal(f.calls.length,0);assert.equal((await response.clone().json()).disabled,true);assert.match(response.headers.get('cache-control'),/private, no-store/);
 const read=await f.module.GET(new Request('http://portal.test/api/admin/audit-events?clientId=2&outcome=failed'));assert.equal(read.status,200);assert.deepEqual(f.calls[0].read,{clientId:'2',outcome:'failed'});assert.match(read.headers.get('cache-control'),/private, no-store/);
});
