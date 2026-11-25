import sharp from 'sharp';
import {GET as cleanupCron} from '../../app/api/cron/client-document-cleanup/route.js';
import {sweepDocumentStorage,queueDocumentCleanup,enqueueDocumentStorageMaintenance} from '../../lib/client-document-storage-maintenance.js';
import {renameDocumentStorage} from '../../lib/client-document-storage-reconcile.js';
import {documentStoragePath} from '../../lib/client-document-storage-path.js';
import {copyStoredDocument,inspectStoredDocument,removeStoredDocument} from '../../lib/client-document-storage-provider.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {createPortalAuth,closeAuthDatabase} from '../../lib/auth.js';
import * as api from '../../app/api/admin/client-document-storage/route.js';
import * as adminOpening from '../../app/api/admin/client-document-storage/[id]/route.js';
import * as listing from '../../app/api/client-documents/route.js';
import * as opening from '../../app/api/client-documents/[id]/route.js';
import {directDocumentStorageReady} from '../../lib/client-document-storage.js';
test('private Storage metadata, authorization and browser-role isolation on disposable PostgreSQL',{skip:!process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL},async t=>{
 const operator=new URL(process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL),origin=process.env.BETTER_AUTH_URL;assert.equal(operator.hostname,'127.0.0.1');assert.match(operator.pathname,/^\/aoc_documents_[a-f0-9]{10}$/);
 const runtime=new URL(process.env.DATABASE_URL);assert.equal(runtime.host,operator.host);assert.equal(runtime.pathname,operator.pathname);assert.notEqual(runtime.username,operator.username);
 const db=new pg.Client({connectionString:operator.href});await db.connect();const f=JSON.parse(readFileSync(process.env.CLIENT_DOCUMENTS_FIXTURE,'utf8')),[A,B]=f.clients,auth=createPortalAuth({useNextCookies:false}),old=globalThis.fetch;
 const provider='https://fixture.supabase.co';Object.assign(process.env,{CLIENT_DOCUMENTS_SUPABASE_URL:provider,CLIENT_DOCUMENTS_STORAGE_BUCKET:'private-fixture',CLIENT_DOCUMENTS_SUPABASE_SERVICE_KEY:'sb_secret_fixture_only'});
 const objects=new Map();let duringRead,failRemoval=false;
 globalThis.fetch=async(url,options={})=>{
  const u=new URL(url);assert.equal(u.origin,provider,'No live provider calls permitted');assert.equal(options.headers.apikey,'sb_secret_fixture_only');
  if(u.pathname.includes('/bucket/'))return Response.json({public:false});
  if(options.method==='DELETE'){if(failRemoval)return new Response(null,{status:503});for(const path of JSON.parse(options.body).prefixes)objects.delete(path);return Response.json([]);}
  if(u.pathname.endsWith('/object/copy')){const body=JSON.parse(options.body);assert.equal(body.bucketId,'private-fixture');assert.ok(objects.has(body.sourceKey));assert.equal(objects.has(body.destinationKey),false);objects.set(body.destinationKey,Buffer.from(objects.get(body.sourceKey)));return Response.json({Key:body.destinationKey});}
  const match=u.pathname.match(/\/private-fixture\/(.+)/),path=match&&decodeURIComponent(match[1]);
  if(u.pathname.includes('/upload/sign/'))return Response.json({url:'/object/upload/sign/private-fixture/'+path+'?token=fixture-object-token'});
  if(u.pathname.includes('/object/sign/')){assert.deepEqual(JSON.parse(options.body),{expiresIn:30});return Response.json({signedURL:'/object/sign/private-fixture/'+path+'?token=fixture-download-token'});}
  const content=objects.get(path);if(!content)return new Response(null,{status:404});
  if(u.pathname.includes('/object/info/'))return Response.json({id:path,size:content.length,version:1});
  if(duringRead){const work=duringRead;duringRead=null;await work();}
  const range=options.headers.Range;if(range){const [,a,b]=/^bytes=([0-9]+)-([0-9]+)$/.exec(range);return new Response(content.subarray(Number(a),Number(b)+1),{status:206,headers:{'Content-Range':'bytes '+a+'-'+b+'/'+content.length,'Content-Length':String(Number(b)-Number(a)+1)}});}return new Response(content,{headers:{'Content-Length':String(content.length)}});
 };
 function headers(key='admin',client=A){return new Headers({host:new URL(origin).host,origin,'Content-Type':'application/json',cookie:(f.accounts[key]?.cookie||'')+'; aoc_active_client='+encodeURIComponent('docs-check-'+f.clients.indexOf(client))});}
 const post=(body,key='admin')=>api.POST(new Request(origin+'/api/admin/client-document-storage',{method:'POST',headers:headers(key),body:JSON.stringify(body)}));
 const list=(key='client',client=A)=>listing.GET(new Request(origin+'/api/client-documents?clientId='+client.id,{headers:headers(key,client)}));
 const open=(item,key='client',client=A)=>opening.GET(new Request(origin+item.downloadUrl,{headers:headers(key,client)}),{params:Promise.resolve({id:item.id})});
 const command=(extra={})=>({action:'prepare',clientId:A.id,operation:crypto.randomUUID(),title:'Approved source',description:'Synthetic only',filename:'code.js',size:3*1024*1024,share:true,...extra});
 const complete=(body,id,key='admin')=>post({action:'complete',clientId:body.clientId,operation:body.operation,id},key);
 const attach=async(body,prepared,content=Buffer.alloc(body.size,120))=>{objects.set(prepared.upload.path,content);return complete(body,prepared.id);};
 let body,prepared,saved,entry;
 try{
  await db.query('DELETE FROM "rateLimit"');for(const [key,a] of Object.entries(f.accounts)){const response=await auth.api.signInUsername({body:{username:a.username,password:a.password},headers:new Headers({origin}),asResponse:true});assert.equal(response.status,200,key);a.cookie=response.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
  await t.test('restrictive policy defeats broad permissive grants for anon/authenticated',async()=>{
   const role=(await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[runtime.username])).rows[0];assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);assert.equal(await directDocumentStorageReady(),true);
   for(const role of ['anon','authenticated']){await db.query('BEGIN');try{await db.query('SET LOCAL ROLE '+role);const rows=(await db.query('SELECT bucket_id FROM storage.objects')).rows;assert.deepEqual(rows,[{bucket_id:'other-bucket'}]);await assert.rejects(db.query("INSERT INTO storage.objects(bucket_id) VALUES('private-fixture')"),{code:'42501'});}finally{await db.query('ROLLBACK');}}
   for(const role of ['anon','authenticated'])for(const table of ['portal_client_document_objects','portal_client_document_object_audit','portal_client_document_storage_cleanup'])assert.equal((await db.query("SELECT has_table_privilege($1,$2,'SELECT') ok",[role,table])).rows[0].ok,false);
  });
  await t.test('prepare accepts files larger than 2MB but does not release unverified objects',async()=>{
   body=command();const response=await post(body);assert.equal(response.status,200);prepared=await response.json();assert.equal(prepared.prepared,true);assert.equal(prepared.upload.path,'clients/'+A.id+'/'+prepared.id+'/code.js');assert.doesNotMatch(JSON.stringify(prepared),/sb_secret/);assert.equal((await(await list()).json()).items.some(x=>x.id===prepared.id),false);
   const replay=await(await post(body)).json();assert.equal(replay.id,prepared.id);assert.equal((await post({...body,title:'Changed retry'})).status,409);
   assert.equal((await complete(body,prepared.id)).status,409);
  });
  await t.test('ordinary clients and Internal Portal cannot prepare or finalize documents',async()=>{
   for(const key of ['client','internal','unrelated']){assert.ok([401,403].includes((await post(command(),key)).status));assert.ok([401,403].includes((await complete(body,prepared.id,key)).status));}
   assert.equal((await post(command({ownerId:f.accounts.client.id}))).status,400);
   assert.equal((await post(command({filename:'bad.exe'}))).status,415);
   assert.equal((await post(command({filename:'../code.js'}))).status,415);
  });
  await t.test('full verification commits one immutable object and one receipt across concurrent retries',async()=>{
   objects.set(prepared.upload.path,Buffer.alloc(body.size,120));const responses=await Promise.all([complete(body,prepared.id),complete(body,prepared.id)]);for(const response of responses)assert.equal(response.status,200);saved=await responses[0].json();assert.equal(saved.status,'published_link');assert.equal((await db.query('SELECT count(*)::int n FROM portal_client_document_object_audit WHERE file_id=$1',[saved.id])).rows[0].n,1);
   for(let attempt=0;attempt<8;attempt++){const pair=await Promise.all([complete(body,prepared.id),complete(body,prepared.id)]);for(const r of pair){assert.equal(r.status,200);assert.equal((await r.json()).id,saved.id);}}
   entry=(await(await list()).json()).items.find(x=>x.id===saved.id);assert.equal(entry.delivery,'storage');assert.equal(entry.canView,false);assert.match(entry.downloadUrl,/source=storage/);assert.doesNotMatch(JSON.stringify(entry),/private-fixture|object_path|content_hash|fixture-object-token/);
  });
  await t.test('downloads reauthorize, use private no-store and issue a 30-second attachment grant',async()=>{
   const response=await open(entry);assert.equal(response.status,303);assert.match(response.headers.get('cache-control'),/no-store/);const url=new URL(response.headers.get('location'));assert.equal(url.searchParams.get('download'),'code.js');
   for(const [key,client] of [['unrelated',B],['client',B]])assert.ok([401,403,404].includes((await open(entry,key,client)).status));
   await db.query("INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES($1,$2,'client_admin',true)",[B.id,f.accounts.client.id]);assert.equal((await open(entry,'client',B)).status,404);const swapped={...entry,downloadUrl:entry.downloadUrl.replace('clientId='+A.id,'clientId='+B.id)};assert.equal((await open(swapped,'client',B)).status,404);await db.query('DELETE FROM portal_memberships WHERE client_id=$1 AND user_id=$2',[B.id,f.accounts.client.id]);
   assert.equal((await post({action:'publish',clientId:B.id,id:saved.id,revision:saved.revision,operation:crypto.randomUUID()})).status,404);
   await db.query('UPDATE portal_memberships SET is_active=false WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);assert.ok([403,404].includes((await open(entry)).status));await db.query('UPDATE portal_memberships SET is_active=true WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);
  });
  await t.test('unshare and stale revisions prevent new download grants; edits preserve scope',async()=>{
   let response=await post({action:'revoke',clientId:A.id,id:saved.id,revision:saved.revision,operation:crypto.randomUUID()});assert.equal(response.status,200);saved=await response.json();assert.equal((await open(entry)).status,404);
   response=await post({action:'update',clientId:A.id,id:saved.id,revision:saved.revision,operation:crypto.randomUUID(),title:'Edited source',description:'Approved material',share:true});assert.equal(response.status,200);saved=await response.json();entry=(await(await list()).json()).items.find(x=>x.id===saved.id);assert.equal(entry.description,'Approved material');
   assert.equal((await post({action:'publish',clientId:A.id,id:saved.id,revision:'1',operation:crypto.randomUUID()})).status,409);
  });
  await t.test('a previously failed WebP image named JPEG resumes its existing ticket and records the correct filename',async()=>{
   const content=Buffer.from('RIFF\x10\x00\x00\x00WEBPVP8 synthetic'),input=command({filename:'photo.jpeg',title:'photo.jpeg',size:content.length}),ticket=await(await post(input)).json();objects.set(ticket.upload.path,content);
   const retry=await post(input);assert.equal(retry.status,200);const resumed=await retry.json();assert.equal(resumed.id,ticket.id);assert.deepEqual(resumed.upload,{stored:true});
   const response=await complete(input,ticket.id);assert.equal(response.status,200);const record=(await db.query('SELECT filename,mime_type,title,state FROM portal_client_document_objects WHERE id=$1',[ticket.id])).rows[0];assert.deepEqual(record,{filename:'photo.webp',mime_type:'image/webp',title:'photo.webp',state:'ready'});assert.equal((await db.query('SELECT count(*)::int n FROM portal_client_document_object_audit WHERE file_id=$1',[ticket.id])).rows[0].n,1);
   assert.equal((await complete(input,ticket.id)).status,200);assert.equal((await db.query('SELECT count(*)::int n FROM portal_client_document_object_audit WHERE file_id=$1',[ticket.id])).rows[0].n,1);
   assert.equal((await post({action:'archive',clientId:A.id,id:ticket.id,revision:'1',operation:crypto.randomUUID()})).status,200);
  });
  await t.test('invalid bytes and revoked administrator during validation never publish',async()=>{
   const bad=command({size:9,filename:'fake.pdf'}),ticket=await(await post(bad)).json();assert.equal((await attach(bad,ticket,Buffer.from('not a pdf'))).status,415);assert.equal((await(await list()).json()).items.some(x=>x.id===ticket.id),false);
   const next=command({size:10}),pending=await(await post(next)).json();duringRead=()=>db.query('UPDATE portal_admins SET is_active=false WHERE user_id=$1',[f.accounts.admin.id]);assert.equal((await attach(next,pending)).status,403);await db.query('UPDATE portal_admins SET is_active=true WHERE user_id=$1',[f.accounts.admin.id]);assert.equal((await db.query('SELECT state FROM portal_client_document_objects WHERE id=$1',[pending.id])).rows[0].state,'pending');
  });
  await t.test('image and PDF previews recheck membership, current revision and publisher before streaming',async()=>{
   for(const [filename,content,mime] of [['image.png',Buffer.from([137,80,78,71,13,10,26,10,0,0]),'image/png'],['report.pdf',Buffer.from('%PDF-1.4 synthetic database preview'),'application/pdf']]){
    const input=command({filename,size:content.length,title:filename}),ticket=await(await post(input)).json();assert.equal((await attach(input,ticket,content)).status,200);const item=(await(await list()).json()).items.find(x=>x.id===ticket.id);
    const preview=(key='client',client=A,extra={},revision='1')=>{const h=headers(key,client);for(const [name,value] of Object.entries(extra))h.set(name,value);const url=origin+item.downloadUrl.replace('mode=download','mode=view');return opening.GET(new Request(url.replace('revision=1','revision='+revision),{headers:h}),{params:Promise.resolve({id:item.id})});};
    let response=await preview();assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),mime);assert.match(response.headers.get('content-disposition'),/^inline;/);assert.match(response.headers.get('cache-control'),/no-store/);assert.equal(response.headers.get('location'),null);assert.equal(Buffer.compare(Buffer.from(await response.arrayBuffer()),content),0);
    response=await preview('client',A,{Range:'bytes=0-3'});assert.equal(response.status,206);assert.equal(response.headers.get('content-range'),'bytes 0-3/'+content.length);assert.equal((await response.arrayBuffer()).byteLength,4);
    assert.equal((await preview('client',A,{Range:'bytes=999-'})).status,416);assert.equal((await preview('client',A,{},'99')).status,404);assert.ok([401,403,404].includes((await preview('unrelated',B)).status));assert.ok([403,404].includes((await preview('client',B)).status));
    const adminResponse=await adminOpening.GET(new Request(origin+'/api/admin/client-document-storage/'+item.id+'?clientId='+A.id+'&revision=1&mode=view',{headers:headers()}),{params:Promise.resolve({id:item.id})});assert.equal(adminResponse.status,200);await adminResponse.body.cancel();
    duringRead=()=>db.query('UPDATE portal_memberships SET is_active=false WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);assert.ok([403,404].includes((await preview()).status));await db.query('UPDATE portal_memberships SET is_active=true WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);
    duringRead=()=>db.query('UPDATE portal_admins SET is_active=false WHERE user_id=$1',[f.accounts.admin.id]);assert.equal((await preview()).status,404);await db.query('UPDATE portal_admins SET is_active=true WHERE user_id=$1',[f.accounts.admin.id]);
    const unshared=await post({action:'revoke',clientId:A.id,id:item.id,revision:'1',operation:crypto.randomUUID()});assert.equal(unshared.status,200);assert.equal((await preview()).status,404);
    assert.equal((await post({action:'archive',clientId:A.id,id:item.id,revision:'2',operation:crypto.randomUUID()})).status,200);
   }
   const codePreview={...entry,downloadUrl:entry.downloadUrl.replace('mode=download','mode=view')};assert.equal((await open(codePreview)).status,415);
  });
  await t.test('client receives a half-resolution image only after fresh scope and publication checks',async()=>{
   const bytes=await sharp({create:{width:800,height:400,channels:3,background:'#158'}}).png().toBuffer(),input=command({filename:'Client image.png',title:'Client image',size:bytes.length}),ticket=await(await post(input)).json();assert.equal((await attach(input,ticket,bytes)).status,200);const item=(await(await list()).json()).items.find(x=>x.id===ticket.id);assert.equal(item.mimeType,'image/png');assert.equal(item.previewKind,'image');assert.equal(item.canView,true);
   const half={...item,downloadUrl:item.viewUrl+'&preview=half'};const response=await open(half);assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');assert.match(response.headers.get('cache-control'),/no-store/);const meta=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(meta.width,400);assert.equal(meta.height,200);assert.equal(objects.get(ticket.upload.path).equals(bytes),true);
   for(const [key,client] of [['unrelated',B],['client',B]])assert.ok([401,403,404].includes((await open(half,key,client)).status));
   duringRead=()=>db.query('UPDATE portal_memberships SET is_active=false WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);assert.ok([403,404].includes((await open(half)).status));await db.query('UPDATE portal_memberships SET is_active=true WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);
   const unshared=await post({action:'revoke',clientId:A.id,id:ticket.id,revision:'1',operation:crypto.randomUUID()});assert.equal(unshared.status,200);assert.equal((await open(half)).status,404);assert.equal((await post({action:'archive',clientId:A.id,id:ticket.id,revision:'2',operation:crypto.randomUUID()})).status,200);
  });
  await t.test('deletion clears private bytes, retries failed cleanup and preserves audit receipts',async()=>{
   const input=command({size:9}),ticket=await(await post(input)).json();assert.equal((await attach(input,ticket,Buffer.from('safe code'))).status,200);
   const action={action:'archive',clientId:A.id,id:ticket.id,revision:'1',operation:crypto.randomUUID()};failRemoval=true;let response=await post(action);assert.equal(response.status,200);assert.equal((await response.json()).storageCleanupPending,true);assert.equal(objects.has(ticket.upload.path),true);
   for(const key of ['client','unrelated','internal'])assert.ok([401,403].includes((await post({action:'cleanup',clientId:A.id},key)).status));assert.equal((await post({action:'cleanup',clientId:A.id,objectPath:ticket.upload.path})).status,400);
   failRemoval=false;response=await post(action);assert.equal(response.status,200);assert.equal((await response.json()).duplicate,true);assert.equal(objects.has(ticket.upload.path),false);assert.equal((await db.query("SELECT count(*)::int n FROM portal_client_document_object_audit WHERE file_id=$1 AND action='archive'",[ticket.id])).rows[0].n,1);
   assert.equal((await db.query('SELECT last_deleted_at IS NOT NULL deleted,finished_at IS NULL follow_up FROM portal_client_document_storage_cleanup WHERE file_id=$1',[ticket.id])).rows[0].follow_up,true);
   // An old upload token could recreate bytes until expiry. The durable final sweep removes them again.
   objects.set(ticket.upload.path,Buffer.from('safe code'));await db.query("UPDATE portal_client_document_storage_cleanup SET next_attempt_at=now()-interval '1 second' WHERE file_id=$1",[ticket.id]);failRemoval=true;const failedFollowUp=await post({action:'cleanup',clientId:A.id});assert.equal((await failedFollowUp.json()).storageCleanup.pending>0,true);failRemoval=false;assert.equal((await post({action:'cleanup',clientId:A.id})).status,200);assert.equal(objects.has(ticket.upload.path),false);
   objects.set(ticket.upload.path,Buffer.from('safe code'));await db.query("UPDATE portal_client_document_storage_cleanup SET final_check_after=now()-interval '1 second',next_attempt_at=now()-interval '1 second' WHERE file_id=$1",[ticket.id]);assert.equal((await post({action:'cleanup',clientId:A.id})).status,200);assert.equal(objects.has(ticket.upload.path),false);
  });
  await t.test('reconciliation preserves active bytes and IDs, recovers after a copy interruption and cleans only retired paths',async()=>{
   const input=command({filename:'Human report.txt',size:9}),ticket=await(await post(input)).json();assert.equal((await attach(input,ticket,Buffer.from('safe code'))).status,200);const canonical=ticket.upload.path,old='clients/'+A.id+'/'+ticket.id+'/document.txt';objects.set(old,objects.get(canonical));objects.delete(canonical);await db.query('UPDATE portal_client_document_objects SET object_path=$2 WHERE id=$1',[ticket.id,old]);
   const config={origin:provider,bucket:'private-fixture'},transaction=async work=>{await db.query('BEGIN');try{const answer=await work(db);await db.query('COMMIT');return answer;}catch(error){await db.query('ROLLBACK');throw error;}};
   const rename=()=>renameDocumentStorage({transaction,client:A.id,id:ticket.id,actor:f.accounts.admin.id,config,copy:copyStoredDocument,inspect:inspectStoredDocument});
   // Simulate interruption after copy but before its DB commit; retry adopts only hash-matching content.
   objects.set(canonical,Buffer.from('wrong byt'));await assert.rejects(rename(),/does not match/);assert.equal((await db.query('SELECT object_path FROM portal_client_document_objects WHERE id=$1',[ticket.id])).rows[0].object_path,old);objects.delete(canonical);
   await assert.rejects(renameDocumentStorage({transaction,client:A.id,id:ticket.id,actor:f.accounts.admin.id,config,copy:copyStoredDocument,inspect:async(...args)=>{await inspectStoredDocument(...args);throw Error('Simulated operator interruption');}}),/interruption/);assert.equal(objects.has(canonical),true);assert.equal((await db.query('SELECT object_path FROM portal_client_document_objects WHERE id=$1',[ticket.id])).rows[0].object_path,old);
   assert.equal(await rename(),true);assert.equal(await rename(),false);const row=(await db.query('SELECT * FROM portal_client_document_objects WHERE id=$1',[ticket.id])).rows[0];assert.equal(row.id,ticket.id);assert.equal(row.filename,'Human report.txt');assert.equal(String(row.revision),'1');assert.equal(row.object_path,canonical);
   // A forged job aimed at a currently active path is protected even if a worker sees it.
   await transaction(c=>queueDocumentCleanup(c,row));const report=await sweepDocumentStorage({transaction,config,remove:removeStoredDocument,client:A.id,fileId:ticket.id,limit:5,retry:true});assert.equal(report.protected,1);assert.equal(objects.has(canonical),true);assert.equal(objects.has(old),false);
   assert.equal((await db.query("SELECT count(*)::int n FROM portal_client_document_object_audit WHERE file_id=$1 AND action='storage_rename'",[ticket.id])).rows[0].n,1);
   const foreign=await renameDocumentStorage({transaction,client:B.id,id:ticket.id,actor:f.accounts.admin.id,config,copy:copyStoredDocument,inspect:inspectStoredDocument});assert.equal(foreign,false);assert.equal(documentStoragePath(A.id,ticket.id,row.filename),canonical);assert.equal((await post({action:'archive',clientId:A.id,id:ticket.id,revision:'1',operation:crypto.randomUUID()})).status,200);assert.equal(objects.has(canonical),false);
  });
  await t.test('cleanup workers reject expired pending uploads and concurrent workers never delete an active file',async()=>{
   const input=command({size:9}),ticket=await(await post(input)).json();objects.set(ticket.upload.path,Buffer.from('safe code'));await db.query("UPDATE portal_client_document_objects SET upload_grant_expires_at=now()-interval '26 hours' WHERE id=$1",[ticket.id]);
   const response=await post({action:'cleanup',clientId:A.id});assert.equal(response.status,200);assert.equal(objects.has(ticket.upload.path),false);assert.equal((await complete(input,ticket.id)).status,404);
   // Two independent ordinary-role workers compete for the same due receipt.
   const c1=new pg.Client({connectionString:runtime.href}),c2=new pg.Client({connectionString:runtime.href});await c1.connect();await c2.connect();let calls=0;
   try{await db.query("UPDATE portal_client_document_storage_cleanup SET finished_at=NULL,last_deleted_at=NULL,next_attempt_at=now()-interval '1 second',final_check_after=now()-interval '1 second' WHERE file_id=$1",[ticket.id]);
    const transaction=connection=>async work=>{await connection.query('BEGIN');try{const value=await work(connection);await connection.query('COMMIT');return value;}catch(error){await connection.query('ROLLBACK');throw error;}};
    await Promise.all([c1,c2].map(connection=>sweepDocumentStorage({transaction:transaction(connection),config:{origin:provider,bucket:'private-fixture'},remove:async path=>{calls++;assert.equal(path,ticket.upload.path);await new Promise(resolve=>setTimeout(resolve,50));},client:A.id,fileId:ticket.id,limit:1})));assert.equal(calls,1);
   }finally{await c1.end();await c2.end();}
  });
  await t.test('cleanup scheduler requires its server secret, independent of a portal cookie',async()=>{
   const previous=process.env.SOURCE_SYNC_SECRET;process.env.SOURCE_SYNC_SECRET='fixture-only-cleanup-secret-with-thirty-two-characters';
   try{for(const authorization of ['', 'Bearer wrong']){const h=headers('client');if(authorization)h.set('authorization',authorization);assert.equal((await cleanupCron(new Request(origin+'/api/cron/client-document-cleanup',{headers:h}))).status,401);}
    const response=await cleanupCron(new Request(origin+'/api/cron/client-document-cleanup',{headers:{authorization:'Bearer '+process.env.SOURCE_SYNC_SECRET}}));assert.equal(response.status,200);assert.match(response.headers.get('cache-control'),/no-store/);assert.doesNotMatch(JSON.stringify(await response.json()),/sb_secret|clients\//);
   }finally{if(previous===undefined)delete process.env.SOURCE_SYNC_SECRET;else process.env.SOURCE_SYNC_SECRET=previous;}
  });
  await t.test('configured bucket changes fail closed and audit rows never retain upload secrets',async()=>{
   process.env.CLIENT_DOCUMENTS_STORAGE_BUCKET='different-bucket';assert.equal(await directDocumentStorageReady(),false);assert.equal((await open(entry)).status,409);process.env.CLIENT_DOCUMENTS_STORAGE_BUCKET='private-fixture';
   const logs=JSON.stringify((await db.query('SELECT to_jsonb(e) value FROM portal_admin_operation_audit e')).rows);assert.doesNotMatch(logs,/sb_secret_fixture_only|fixture-object-token|fixture-download-token/);
   assert.equal((await post({action:'archive',clientId:A.id,id:saved.id,revision:saved.revision,operation:crypto.randomUUID()})).status,200);assert.equal((await open(entry)).status,404);
  });
 }finally{globalThis.fetch=old;await db.query('DELETE FROM portal_memberships WHERE client_id=$1 AND user_id=$2',[B.id,f.accounts.client.id]);await db.query('UPDATE portal_admins SET is_active=true WHERE user_id=$1',[f.accounts.admin.id]);await db.query('UPDATE portal_memberships SET is_active=true WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);await closeAuthDatabase();await db.end();}
});
