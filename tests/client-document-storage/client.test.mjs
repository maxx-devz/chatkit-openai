import test from 'node:test';
import assert from 'node:assert/strict';
import {uploadClientDocument} from '../../lib/upload-client-document.js';
const old=globalThis.fetch,origin='https://fixture.supabase.co',endpoint='https://fixture.storage.supabase.co/storage/v1/upload/resumable/sign';
const upload={origin,endpoint,bucket:'private-fixture',path:'clients/1/a/document.js',signedUrl:origin+'/storage/v1/object/upload/sign/private-fixture/clients/1/a/document.js?token=fixture',token:'fixture'};
test.after(()=>{globalThis.fetch=old;});
test('a file larger than 2MB bypasses the portal body and completes only after direct transfer',async()=>{
 const calls=[];globalThis.fetch=async(url,opts)=>{calls.push([String(url),opts]);if(String(url).startsWith(origin))return new Response(null,{status:200});const b=JSON.parse(opts.body);return Response.json(b.action==='prepare'?{prepared:true,id:'fixture',upload}:{saved:true,id:'fixture'});};
 const file=new File(['x'.repeat(3*1024*1024)],'large.js');const answer=await uploadClientDocument({clientId:'1',operation:crypto.randomUUID(),title:'Large source',share:false,file});assert.equal(answer.saved,true);assert.equal(calls.length,3);assert.equal(calls[1][1].body,file);assert.equal(calls[1][1].credentials,'omit');assert.equal(JSON.parse(calls[0][1].body).size,file.size);assert.equal(JSON.parse(calls[2][1].body).action,'complete');
});
test('large TUS uploads resume from the confirmed offset without replaying completed chunks',async()=>{
 let offset=0,fail=true,heads=0,completed=0;const parts=[],length=13*1024*1024;
 globalThis.fetch=async(url,opts)=>{url=String(url);if(url.startsWith('/api/')){const b=JSON.parse(opts.body);if(b.action==='complete')completed++;return Response.json(b.action==='prepare'?{prepared:true,id:'fixture',upload}:{saved:true});}
 if(opts.method==='POST')return new Response(null,{status:201,headers:{Location:endpoint+'/fixture'}});
 if(opts.method==='HEAD'){heads++;return new Response(null,{headers:{'Upload-Offset':String(offset)}});}
 if(opts.method==='PATCH'){parts.push(opts.body.size);if(offset>0&&fail){fail=false;return new Response(null,{status:503});}offset+=opts.body.size;return new Response(null,{status:204,headers:{'Upload-Offset':String(offset)}});}throw Error('Unexpected request');};
 const args={clientId:'1',operation:crypto.randomUUID(),title:'Large',share:true,direct:true,file:new File(['x'.repeat(length)],'large.js')};
 await assert.rejects(uploadClientDocument(args),/paused/);assert.equal(completed,0);await uploadClientDocument(args);assert.equal(heads,1);assert.equal(offset,length);assert.equal(completed,1);assert.deepEqual(parts,[6*1024*1024,6*1024*1024,6*1024*1024,1024*1024]);
});
test('foreign resumable URLs and non-JSON authorization failures cannot finalize',async()=>{
 globalThis.fetch=async()=>Response.json({prepared:true,id:'fixture',upload:{...upload,endpoint:'https://foreign.example/storage/v1/upload/resumable/sign'}});
 await assert.rejects(uploadClientDocument({clientId:'1',operation:crypto.randomUUID(),title:'X',share:false,direct:true,file:new File(['x'.repeat(7*1024*1024)],'x.js')}),/invalid resumable/);
 globalThis.fetch=async()=>new Response('denied',{status:403});await assert.rejects(uploadClientDocument({clientId:'1',operation:crypto.randomUUID(),share:false,file:new File(['x'],'x.txt')}),{status:403});
});


test('retrying a pending uploaded image skips its PUT and keeps the original operation for completion',async()=>{
 const calls=[];globalThis.fetch=async(url,opts)=>{assert.equal(url,'/api/admin/client-document-storage');const body=JSON.parse(opts.body);calls.push(body);return Response.json(body.action==='prepare'?{prepared:true,id:'pending-image',upload:{stored:true}}:{saved:true,id:'pending-image'});};
 const operation=crypto.randomUUID(),result=await uploadClientDocument({clientId:'1',operation,title:'photo.jpeg',file:new File(['RIFF\x10\x00\x00\x00WEBPVP8 synthetic'],'photo.jpeg'),share:true,direct:true});assert.equal(result.saved,true);assert.deepEqual(calls.map(x=>x.action),['prepare','complete']);assert.equal(calls[1].operation,operation);assert.equal(calls[1].id,'pending-image');
});
