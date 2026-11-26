import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import {chatKeyFingerprint,reportingBindingMatches} from '../lib/openai-reporting-pair.js';
async function harness({row=null,changed=false}={}){
 let reads=0;const requests=[],envLoads=[];
 const state={row};
 const mocks={providerState:async()=>{reads++;return {rows:state.row?[reads>1&&changed?{...state.row,encrypted_key:'rotated'}:state.row]:[]};},getRuntimeProvider:async()=>({apiKey:'sk-synthetic-chat'}),unsealReportingKey:()=> 'sk-synthetic-report',reportingBindingMatches,createOrganizationUsageReporter:({env={}}={})=>async month=>{const config={...env};if(!config.OPENAI_ADMIN_KEY){envLoads.push(config);return {period:month,configured:false};}requests.push(config);return {period:month,configured:true,usage:{status:'ready'},costs:{status:'ready'}};}};
 const slot=randomUUID();globalThis[slot]=mocks;
 try{const source=await readFile(new URL('../lib/openai-organization-usage-server.js',import.meta.url),'utf8');const code=`const {${Object.keys(mocks).join(',')}}=globalThis[${JSON.stringify(slot)}];\n`+source.replace(/^import .*;\r?\n/gm,'');return {api:await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')),requests,envLoads};}finally{delete globalThis[slot];}
}
const row=()=>({provider:'openai',encrypted_key:'encrypted',encrypted_reporting_key:'report-encrypted',reporting_binding:{projectId:'proj_A',organizationId:'org-A',chatKeyHash:chatKeyFingerprint('sk-synthetic-chat')}});
test('saved pairs supply only their project and organization to reporting',async()=>{
 const h=await harness({row:row()});const report=await h.api.loadOpenAIOrganizationUsage('2026-11');assert.equal(report.connectionSource,'paired');assert.equal(h.requests[0].OPENAI_USAGE_PROJECT_IDS,'proj_A');assert.equal(h.requests[0].OPENAI_USAGE_ORGANIZATION_ID,'org-A');assert.doesNotMatch(JSON.stringify(report),/sk-synthetic-report|chatKeyHash|encrypted/);
});
test('a saved unpaired or mismatched chat key cannot use a stale environment reporting key',async()=>{
 for(const update of [{encrypted_reporting_key:null},{reporting_binding:{...row().reporting_binding,chatKeyHash:'0'.repeat(64)}}]){const h=await harness({row:{...row(),...update}}),report=await h.api.loadOpenAIOrganizationUsage('2026-11');assert.equal(report.configured,false);assert.equal(report.connectionSource,'unpaired');assert.equal(h.requests.length,0);}
});
test('rotating a connection during a report prevents delivery of the old project results',async()=>{
 const h=await harness({row:row(),changed:true});await assert.rejects(h.api.loadOpenAIOrganizationUsage('2026-11'),{code:'reporting_connection_changed'});
});
test('environment-only configuration remains explicitly labeled before a DB chat connection exists',async()=>{
 const h=await harness();assert.equal((await h.api.loadOpenAIOrganizationUsage('2026-11')).connectionSource,'environment');
});
