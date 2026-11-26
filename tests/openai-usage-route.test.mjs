import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {randomUUID} from 'node:crypto';
async function fixture({denied=false,revoke=false,query='?month=2026-11'}={}){
 let checks=0,reads=0;const key=randomUUID();globalThis[key]={resolveAdminContext:async()=>{checks++;if(denied||revoke&&checks===2)throw {publicDetails:{status:denied==='guest'?401:403}};},adminErrorResponse:error=>Response.json({error:'Denied'},{status:error.publicDetails.status}),loadOpenAIOrganizationUsage:async month=>{reads++;return {period:month,configured:true,scope:{kind:'organization'},usage:{status:'ready',rows:[]},costs:{status:'ready',rows:[]}};}};
 const source=await readFile(new URL('../app/api/admin/openai-usage/route.js',import.meta.url),'utf8');
 try{
  const prefix=`const withAdminAudit=(_operation,handler)=>handler;const {resolveAdminContext,adminErrorResponse,loadOpenAIOrganizationUsage}=globalThis[${JSON.stringify(key)}];\n`;
  const code=prefix+source.replace(/^import .+;\r?\n/gm,'');
  const routeModule=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
  return {response:await routeModule.GET(new Request('https://portal.test/api/admin/openai-usage'+query)),checks,reads};
 }finally{delete globalThis[key];}
}
test('Guest, client and independent Internal Portal accounts cannot fetch organization reports',async()=>{
 for(const role of ['guest','client','internal']){const f=await fixture({denied:role});assert.equal(f.response.status,role==='guest'?401:403);assert.equal(f.reads,0);assert.match(f.response.headers.get('cache-control'),/private, no-store/);assert.doesNotMatch(await f.response.text(),/organization/);}
});
test('Active admins can read the report with private headers and a second access check',async()=>{
 const f=await fixture();assert.equal(f.response.status,200);assert.equal(f.checks,2);assert.equal(f.reads,1);assert.equal((await f.response.json()).period,'2026-11');assert.equal(f.response.headers.get('vary'),'Cookie');
});
test('Revocation during the provider read prevents delivery of the fetched report',async()=>{
 const f=await fixture({revoke:true});assert.equal(f.response.status,403);assert.equal(f.reads,1);assert.doesNotMatch(await f.response.text(),/organization/);
});
test('Request parameters cannot override server project scope, credentials or endpoint',async()=>{
 for(const query of ['?month=2026-11&project_ids=proj_foreign','?clientId=2','?url=https://evil.test','?month=2026-11&month=2026-10']){const f=await fixture({query});assert.equal(f.response.status,400);assert.equal(f.reads,0);}
});
