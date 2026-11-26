import test from 'node:test';
import assert from 'node:assert/strict';
import {createOrganizationUsageReporter,organizationReportPeriod} from '../lib/openai-organization-usage.js';
import {openAIUsageCsv,reportNumber,reportUsd} from '../lib/openai-usage-format.js';
const now=Date.parse('2026-11-26T12:00:00Z'),day=Date.parse('2026-11-02T00:00:00Z')/1000;
const token=(changes={})=>({object:'organization.usage.completions.result',project_id:'proj_portal',model:'gpt-5.6-sol',num_model_requests:2,input_tokens:1000,output_tokens:100,input_cached_tokens:400,input_cache_write_tokens:100,input_audio_tokens:0,output_audio_tokens:0,...changes});
const charge=(changes={})=>({object:'organization.costs.result',project_id:'proj_portal',line_item:'model usage',amount:{value:0.0123456789,currency:'usd'},...changes});
const page=(result,more=false,cursor=null)=>({object:'page',data:[{object:'bucket',start_time:day,end_time:day+86400,results:result}],has_more:more,next_page:cursor});
function fixture({env={OPENAI_ADMIN_KEY:'synthetic-admin-key',OPENAI_API_KEY:'unused-chat-key',OPENAI_USAGE_PROJECT_IDS:'proj_portal'},handler,clock=()=>now}={}){
 const calls=[];
 const load=createOrganizationUsageReporter({env,now:clock,fetchImpl:async(url,options)=>{calls.push({url:new URL(url),options});return handler?handler(new URL(url),options,calls):Response.json(page([String(url).includes('/costs')?charge():token()]));}});
 return {load,calls,env};
}
test('Missing Admin key never substitutes the paid chat key or sends a provider request',async()=>{
 const f=fixture({env:{OPENAI_API_KEY:'paid-project-secret'}}),report=await f.load('2026-11');
 assert.equal(report.configured,false);assert.deepEqual(report.requiredConfiguration,['OPENAI_ADMIN_KEY']);assert.equal(f.calls.length,0);assert.ok(!JSON.stringify(report).includes('paid-project-secret'));
});
test('Calls the two official read-only APIs with matched UTC/project scopes and explicit grouping',async()=>{
 const f=fixture(),r=await f.load('2026-11');assert.equal(f.calls.length,2);
 for(const {url,options} of f.calls){assert.equal(url.origin,'https://api.openai.com');assert.equal(options.redirect,'error');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer synthetic-admin-key');assert.equal(options.method,undefined);assert.equal(url.searchParams.get('bucket_width'),'1d');assert.equal(url.searchParams.get('limit'),'31');assert.deepEqual(url.searchParams.getAll('project_ids'),['proj_portal']);assert.equal(Number(url.searchParams.get('end_time')),now/1000);}
 assert.deepEqual(f.calls[0].url.searchParams.getAll('group_by'),['project_id','model']);assert.deepEqual(f.calls[1].url.searchParams.getAll('group_by'),['project_id','line_item']);
 assert.equal(r.usage.totals.inputTokens,1000);assert.equal(r.usage.totals.cachedInputTokens,400);assert.equal(r.usage.totals.requests,2);assert.equal(r.costs.totalUsd,'0.012345678900');assert.equal(r.scope.kind,'projects');assert.ok(!JSON.stringify(r).includes('synthetic-admin-key'));
});
test('Completed-month bounds are exclusive UTC; future and invalid months never fetch',async()=>{
 assert.deepEqual(organizationReportPeriod('2026-10',now),{month:'2026-10',start:Date.parse('2026-10-01T00:00:00Z')/1000,end:Date.parse('2026-11-01T00:00:00Z')/1000});
 const f=fixture();for(const value of ['2026-12','2026-13','2026-1','../../secret'])await assert.rejects(f.load(value),TypeError);assert.equal(f.calls.length,0);
});
test('Organization scope is explicit when no project IDs are configured; malformed filters never widen scope',async()=>{
 const f=fixture({env:{OPENAI_ADMIN_KEY:'synthetic'}});assert.equal((await f.load()).scope.kind,'organization');assert.equal(f.calls[0].url.searchParams.has('project_ids'),false);
 const invalid=fixture({env:{OPENAI_ADMIN_KEY:'synthetic',OPENAI_USAGE_PROJECT_IDS:'not-a-project'}});assert.equal((await invalid.load()).configured,false);assert.equal(invalid.calls.length,0);
});
test('Pagination sums every page; cached input is a subset and dollars never come from local prices',async()=>{
 const f=fixture({handler:url=>{const second=url.searchParams.has('page'),cost=url.pathname.endsWith('/costs');return Response.json(page([cost?charge({line_item:second?'storage':'model usage',amount:{value:second?0.1:0.2,currency:'usd'}}):token({model:second?'another-model':'gpt-5.6-sol'})],!second,second?null:'cursor-2'));}});
 const r=await f.load();assert.equal(f.calls.length,4);assert.equal(r.usage.totals.inputTokens,2000);assert.equal(r.usage.totals.cachedInputTokens,800);assert.equal(r.costs.totalUsd,'0.300000000000');
});
test('A failed token report preserves provider dollar costs and never fabricates zero tokens',async()=>{
 const f=fixture({handler:url=>url.pathname.endsWith('/costs')?Response.json(page([charge()])):new Response('private upstream body and secret',{status:403})});const r=await f.load();
 assert.equal(r.usage.status,'unavailable');assert.equal(r.usage.code,'admin_permission_required');assert.equal(r.usage.totals,undefined);assert.equal(r.costs.status,'ready');assert.ok(!JSON.stringify(r).includes('private upstream'));
});
test('Permission, authentication, rate-limit and timeout failures remain actionable and private',async()=>{
 for(const [status,code] of [[401,'admin_key_rejected'],[403,'admin_permission_required'],[429,'provider_rate_limited'],[500,'provider_unavailable']]){const f=fixture({handler:()=>new Response('private error',{status})});const r=await f.load();assert.equal(r.costs.code,code);assert.equal(r.usage.code,code);assert.equal(r.costs.totalUsd,undefined);}
 const f=fixture({handler:()=>{throw new DOMException('private endpoint','TimeoutError');}});assert.equal((await f.load()).usage.code,'report_timeout');
});
test('Malformed, repeated-cursor, oversized and foreign-scope responses never expose partial totals',async()=>{
 for(const handler of [
  ()=>Response.json(page([token({project_id:'proj_foreign'})])),
  ()=>Response.json(page([token({input_cached_tokens:2000})])),
  ()=>Response.json(page([token({input_tokens:-1})])),
  ()=>Response.json(page([token()],true,'same-cursor')),
  ()=>new Response('x'.repeat(2*1024*1024+1)),
  ()=>Response.json({object:'page',data:[],has_more:true,next_page:null}),
 ]){const r=await fixture({handler}).load();assert.equal(r.usage.status,'unavailable');assert.equal(r.usage.totals,undefined);}
 const r=await fixture({handler:url=>Response.json(page([url.pathname.endsWith('/costs')?charge({amount:{value:1,currency:'eur'}}):token()]))}).load();assert.equal(r.costs.status,'unavailable');assert.equal(r.usage.status,'ready');
});
test('Unreported optional counts stay unknown, while a genuinely empty report can show reported zero',async()=>{
 const f=fixture({handler:url=>Response.json(page([url.pathname.endsWith('/costs')?charge():token({input_cached_tokens:undefined,input_cache_write_tokens:undefined})]))});const r=await f.load();assert.equal(r.usage.totals.cachedInputTokens,null);assert.equal(r.usage.totals.cacheWriteTokens,null);
 const empty=await fixture({handler:()=>Response.json({object:'page',data:[],has_more:false,next_page:null})}).load();assert.equal(empty.usage.totals.inputTokens,0);assert.equal(empty.costs.totalUsd,'0.000000000000');
});
test('Cache deduplicates concurrent requests and is partitioned by credential, project and month',async()=>{
 let time=now;const f=fixture({clock:()=>time});const [a,b]=await Promise.all([f.load(),f.load()]);assert.equal(f.calls.length,2);assert.equal(a.cached,false);assert.equal(b.cached,true);
 f.env.OPENAI_ADMIN_KEY='rotated-secret';await f.load();assert.equal(f.calls.length,4);f.env.OPENAI_USAGE_PROJECT_IDS='proj_other';await f.load();assert.equal(f.calls.length,6);f.env.OPENAI_USAGE_PROJECT_IDS='proj_portal';await f.load('2026-10');assert.equal(f.calls.length,8);
 time+=60001;await f.load();assert.equal(f.calls.length,10);
});
test('CSV keeps token and cost observations separate and escapes spreadsheet formulas',async()=>{
 const f=fixture({handler:url=>Response.json(page([url.pathname.endsWith('/costs')?charge({line_item:'=HYPERLINK("bad")'}):token({model:'@unsafe'})]))});const csv=openAIUsageCsv(await f.load());assert.match(csv,/'=HYPERLINK/);assert.match(csv,/'@unsafe/);assert.match(csv,/"usage"/);assert.match(csv,/"cost"/);
 assert.equal(reportNumber(null),'Unavailable');assert.equal(reportUsd(null),'Unavailable');assert.equal(reportNumber(1200),'1,200');
});
