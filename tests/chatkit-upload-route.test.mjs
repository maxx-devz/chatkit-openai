import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';import {readFile} from 'node:fs/promises';
import {UploadRequestError,uploadErrorMessage} from '../lib/chatkit-uploads.js';
async function fixture({upstream,foreign=false,denied=false,aborted=false}={}) {
 const key=randomUUID(),calls=[];const mocks={
  chatKitBackendUrl:()=>new URL('http://127.0.0.1:8000'),signChatKitRequest:()=>({'x-chatkit-signature':'synthetic'}),
  getPortalAiContext:async()=>{if(denied)throw {publicDetails:{status:403}};return {clientId:'1',userId:'2',aiEnabled:true};},portalErrorResponse:()=>Response.json({error:'Denied'},{status:403}),
  assertTrustedOrigin:()=>{},requestSecurityErrorResponse:()=>null,readUpload:async()=>({filename:'fixture.txt',content:'dGVzdA=='}),UploadRequestError,uploadErrorMessage,
  fetch:async(...args)=>{calls.push(args);if(upstream instanceof Error)throw upstream;return upstream??Response.json({id:'atc_'+'a'.repeat(32),type:'file',name:'fixture.txt',mime_type:'text/plain',content:'private bytes'});},
  console:{warn:()=>{},error:()=>{}}};
 globalThis[key]=mocks;const source=await readFile(new URL('../app/api/chatkit/upload/route.js',import.meta.url),'utf8');let routeModule;
 try{routeModule=await import('data:text/javascript;base64,'+Buffer.from(`const {${Object.keys(mocks).join(',')}}=globalThis[${JSON.stringify(key)}];\n`+source.replace(/^import .*;\r?\n/gm,'')).toString('base64'));}finally{delete globalThis[key];}
 const controller=new AbortController();if(aborted)controller.abort();const response=await routeModule.POST(new Request('https://portal.test/api/chatkit/upload',{method:'POST',headers:{'x-aoc-client':foreign?'2':'1'},body:'fixture',signal:controller.signal}));return {response,data:await response.json(),calls};
}
test('Upload success preserves approved metadata and never returns internal content',async()=>{
 const {response,data,calls}=await fixture();assert.equal(response.status,200);assert.deepEqual(Object.keys(data).sort(),['id','mime_type','name','type']);assert.equal(response.headers.get('cache-control'),'private, no-store');assert.equal(calls.length,1);
});
test('A real proxy timeout returns an actionable 504 code rather than generic 503',async()=>{
 const {response,data,calls}=await fixture({upstream:new DOMException('private upstream details','TimeoutError')});assert.equal(response.status,504);assert.equal(data.code,'upload_timeout');assert.match(data.error,/retry once/);assert.ok(!JSON.stringify(data).includes('private'));assert.equal(calls.length,1,'No duplicate automatic uploads');
});
test('A backend body timeout is preserved instead of becoming an invalid-response failure',async()=>{
 const upstream={ok:true,json:async()=>{throw new DOMException('private upstream details','TimeoutError');}};const f=await fixture({upstream});assert.equal(f.response.status,504);assert.equal(f.data.code,'upload_timeout');
});
test('Busy and timed-out backend storage have distinct safe client messages',async()=>{
 for(const [code,status] of [['upload_busy',409],['upload_timeout',504]]){const f=await fixture({upstream:Response.json({code,error:'private details'},{status})});assert.equal(f.response.status,status);assert.equal(f.data.code,code);assert.ok(!JSON.stringify(f.data).includes('private'));}
});
test('Caller cancellation and a stopped backend do not masquerade as provider billing failures',async()=>{
 const cancelled=await fixture({aborted:true,upstream:new DOMException('cancelled','AbortError')});assert.equal(cancelled.response.status,408);assert.equal(cancelled.data.code,'upload_cancelled');
 const offline=await fixture({upstream:Object.assign(new TypeError('private URL'),{cause:{code:'ECONNREFUSED'}})});assert.equal(offline.response.status,503);assert.equal(offline.data.code,'upload_backend_unavailable');assert.match(offline.data.error,/attachment service/);
});
test('Foreign and unauthorized users never reach the attachment backend',async()=>{
 for(const settings of [{foreign:true},{denied:true}]){const f=await fixture(settings);assert.equal(f.response.status,settings.foreign?409:403);assert.equal(f.calls.length,0);}
});
