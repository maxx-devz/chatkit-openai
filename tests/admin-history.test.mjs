import test from 'node:test';import assert from 'node:assert/strict';
import {historicalAuditDetails} from '../lib/admin-history-details.js';
import {attachAdminHistoryResponses} from '../lib/admin-history-store.js';
import {createAdminAuditedHandler} from '../lib/admin-operation-runner.js';
import {authorizeAdminAudit,noteAdminLegacyEvent} from '../lib/admin-audit-context.js';
const legacy={kind:'action',id:'7',actor_user_id:'1',client_id:'2',action:'aoc.client.update',target_type:'client',target_id:'2'};
test('Raw historical action and target codes become plain-language descriptions',()=>{
 assert.equal(historicalAuditDetails(legacy).action,'Updated client settings');assert.equal(historicalAuditDetails(legacy).target,'Client #2');
 const grant=historicalAuditDetails({action:'client.admin_grant',target_type:'member',target_id:'62'});assert.equal(grant.action,'Granted client administrator access');assert.equal(grant.target,'Account #62');assert.match(grant.description,/Client Administrator/);
 assert.equal(historicalAuditDetails({action:'aoc.audit.read',target_type:'audit'}).target,'Audit log');
});
test('Old entries never invent HTTP 200 or successful request outcomes',()=>{
 const detail=historicalAuditDetails(legacy);assert.equal(detail.http,'Not recorded');assert.equal(detail.outcome,'Event recorded');assert.equal(detail.tone,'neutral');assert.match(detail.message,/did not store/);
 assert.equal(historicalAuditDetails({...legacy,request_details_unavailable:true}).http,'Not recorded');
});
test('Recorded HTTP codes, outcomes and safe messages remain distinct, including a failed stream with HTTP 200',()=>{
 for(const [code,label] of [[200,'200 OK'],[201,'201 Created'],[404,'404 Not found'],[409,'409 Conflict'],[503,'503 Service unavailable']]){const result=historicalAuditDetails({...legacy,request_details:{http_status:code,outcome:code>=400?'failed':'succeeded',summary:'Recorded safe response'}});assert.equal(result.http,label);assert.equal(result.message,'Recorded safe response');}
 const stream=historicalAuditDetails({...legacy,request_details:{http_status:200,outcome:'failed'}});assert.equal(stream.http,'200 OK');assert.equal(stream.outcome,'Failed');assert.equal(stream.tone,'error');
});
test('History enrichment uses exact event IDs, actor and client bindings and excludes browser observations',async()=>{
 const queries=[],db={query:async(sql,values)=>{queries.push({sql,values});return {rows:queries.length===1?[{ready:true}]:[{kind:'action',id:'7',request_id:'recorded-id',http_status:200,outcome:'succeeded'}]};}};
 const result=await attachAdminHistoryResponses(db,[legacy]);assert.equal(result[0].request_details.http_status,200);assert.deepEqual(JSON.parse(queries[1].values[0]),[{kind:'action',id:'7',actor_id:'1',client_id:'2'}]);assert.match(queries[1].sql,/a\.origin='server'/);assert.match(queries[1].sql,/a\.actor_user_id::text=r\.actor_id/);assert.match(queries[1].sql,/a\.client_id::text=r\.client_id/);assert.doesNotMatch(queries[1].sql,/INTERVAL|BETWEEN|ABS\(/);
});
test('Missing schema, failed enrichment and ambiguous references preserve legacy rows without fabricating results',async()=>{
 const absent=await attachAdminHistoryResponses({query:async()=>({rows:[{ready:false}]})},[legacy]);assert.equal(absent[0].request_details,undefined);
 const failed=await attachAdminHistoryResponses({query:async()=>{throw Error('Unavailable');}},[legacy]);assert.equal(failed[0].id,'7');assert.equal(failed[0].request_details_unavailable,true);
 let n=0;const ambiguous=await attachAdminHistoryResponses({query:async()=>({rows:++n===1?[{ready:true}]:[{kind:'action',id:'7',request_id:'one'},{kind:'action',id:'7',request_id:'two'}]})},[legacy]);assert.equal(ambiguous[0].request_details,undefined);
});
test('Only a verified request captures bounded, deduplicated legacy IDs into its final event',async()=>{
 const events=[];noteAdminLegacyEvent('action','999');const handler=createAdminAuditedHandler('admin.clients',async()=>{noteAdminLegacyEvent('action','777');await authorizeAdminAudit({id:'1',name:'Synthetic Operator'});noteAdminLegacyEvent('action','7');noteAdminLegacyEvent('action','7');noteAdminLegacyEvent('access','8');noteAdminLegacyEvent('action','not-an-id');return Response.json({ok:true});},{append:async event=>events.push(event)});
 await handler(new Request('http://portal.test/api/admin/clients',{method:'POST'}));assert.equal(events[0].details.legacy_events,undefined);assert.deepEqual(events[1].details.legacy_events,[{kind:'action',id:'7'},{kind:'access',id:'8'}]);
});
