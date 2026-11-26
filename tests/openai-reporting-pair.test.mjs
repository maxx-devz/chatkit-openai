import test from 'node:test';import assert from 'node:assert/strict';
import {verifyOpenAIReportingPair,reportingBindingMatches,chatKeyFingerprint,OpenAIReportingError} from '../lib/openai-reporting-pair.js';
import {sealProviderKey,sealReportingKey,unsealReportingKey,validateProviderKey} from '../lib/provider-secrets.js';
const input={chatKey:'sk-proj-synthetic-test-key-12345',adminKey:'sk-admin-synthetic-report-key-12345'};
function fixture({deny,foreign=false,malformed=false,noHeaders=false}={}){
 const calls=[];return {calls,fetchImpl:async(url,options)=>{url=new URL(url);calls.push({url,options});if(deny&&url.pathname.endsWith(deny))return new Response('private-provider-body',{status:403});const chat=url.pathname.endsWith('/models'),data=chat?{data:[]}:{object:'page',data:[]};return Response.json(malformed?{}:data,{headers:noHeaders?{}:{'openai-organization':foreign&&chat?'org-B':'org-A',...(chat?{'openai-project':'proj_A'}:{})}});}};
}
test('two keys verify with no manual IDs and reporting is explicitly organization-wide',async()=>{
 const f=fixture(),p=await verifyOpenAIReportingPair(input,f);assert.equal(f.calls.length,3);assert.equal(p.binding.scope,'organization');assert.equal(p.binding.organizationId,'org-A');assert.equal(p.binding.organizationMatch,'verified');assert.equal(p.binding.chatProjectId,'proj_A');assert.ok(reportingBindingMatches(p.binding,input.chatKey));assert.equal(reportingBindingMatches(p.binding,input.chatKey+'other'),false);
 for(const {url,options} of f.calls){assert.equal(url.origin,'https://api.openai.com');assert.equal(options.method,'GET');assert.equal(options.redirect,'error');assert.equal(options.headers['OpenAI-Project'],undefined);assert.equal(url.searchParams.has('project_ids'),false);}
});
test('missing provider metadata remains explicit and does not invent organization/project identity',async()=>{
 const p=await verifyOpenAIReportingPair(input,fixture({noHeaders:true}));assert.equal(p.binding.organizationId,null);assert.equal(p.binding.chatProjectId,null);assert.equal(p.binding.organizationMatch,'not_supplied');assert.ok(reportingBindingMatches(p.binding,input.chatKey));
});
test('invalid or substituted keys fail before network access',async()=>{
 for(const update of [{adminKey:input.chatKey},{chatKey:input.adminKey},{adminKey:''},{chatKey:'sk-or-v1-unknown'}]){const f=fixture();await assert.rejects(verifyOpenAIReportingPair({...input,...update},f),OpenAIReportingError);assert.equal(f.calls.length,0);}assert.throws(()=>validateProviderKey('openai',input.adminKey));
});
test('foreign organizations, denied access and malformed reports are rejected with no private provider body',async()=>{
 for(const options of [{foreign:true},{deny:'costs'},{deny:'models'},{malformed:true}])await assert.rejects(verifyOpenAIReportingPair(input,fixture(options)),error=>error instanceof OpenAIReportingError&&!error.message.includes('private-provider-body')&&!error.message.includes(input.adminKey));
});
test('network errors are sanitized and secrets remain encrypted and purpose checked',async()=>{
 await assert.rejects(verifyOpenAIReportingPair(input,{fetchImpl:async()=>{throw Error(input.adminKey);}}),error=>error.status===503&&!error.message.includes(input.adminKey));
 const secret='synthetic-encryption-key-at-least-32-characters',sealed=sealReportingKey(input.adminKey,secret);assert.equal(unsealReportingKey(sealed,secret),input.adminKey);assert.ok(!sealed.includes(input.adminKey));assert.throws(()=>unsealReportingKey(sealProviderKey('openai',input.chatKey,secret),secret));assert.match(chatKeyFingerprint(input.chatKey),/^[a-f0-9]{64}$/);
});
