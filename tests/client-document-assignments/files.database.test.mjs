import sharp from 'sharp';
import test from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';
import {readFileSync} from 'node:fs';
import {createPortalAuth,closeAuthDatabase} from '../../lib/auth.js';
import * as files from '../../app/api/admin/client-document-files/route.js';
import * as preview from '../../app/api/admin/client-document-files/[id]/route.js';
import * as listing from '../../app/api/client-documents/route.js';
import * as opening from '../../app/api/client-documents/[id]/route.js';
test('real private uploads and scoped downloads on disposable PostgreSQL',{skip:!process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL},async t=>{
 const databaseUrl=process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL,origin=process.env.BETTER_AUTH_URL;
 const u=new URL(databaseUrl);assert.equal(u.hostname,'127.0.0.1');assert.match(u.pathname,/^\/aoc_documents_[a-f0-9]{10}$/);
 const db=new pg.Client({connectionString:databaseUrl});await db.connect();
 const auth=createPortalAuth({useNextCookies:false}),f=JSON.parse(readFileSync(process.env.CLIENT_DOCUMENTS_FIXTURE,'utf8')),[A,B]=f.clients;
 const runtime=new URL(process.env.DATABASE_URL);assert.equal(runtime.host,u.host);assert.equal(runtime.pathname,u.pathname);assert.notEqual(runtime.username,u.username);
 function headers(key='admin',client=A){return new Headers({host:new URL(origin).host,origin,cookie:(f.accounts[key]?.cookie||'')+'; aoc_active_client='+encodeURIComponent('docs-check-'+f.clients.indexOf(client))});}
 const upload=(operation=crypto.randomUUID(),key='admin',client=A,share=false,content='%PDF-1.7\nPrivate synthetic upload')=>{const form=new FormData();for(const [k,v] of Object.entries({clientId:client.id,operation,share:String(share)}))form.set(k,v);form.set('file',new File([content],'Synthetic audit.pdf',{type:'application/pdf'}));const h=headers(key,client);h.set('x-aoc-document-client',client.id);return files.POST(new Request(origin+'/api/admin/client-document-files',{method:'POST',headers:h,body:form}));};
 const command=body=>files.POST(new Request(origin+'/api/admin/client-document-files',{method:'POST',headers:new Headers({...Object.fromEntries(headers()),'Content-Type':'application/json'}),body:JSON.stringify(body)}));
 const list=(key='client',client=A)=>listing.GET(new Request(origin+'/api/client-documents?clientId='+client.id,{headers:headers(key,client)}));
 const open=(item,key='client',client=A)=>opening.GET(new Request(origin+item.viewUrl,{headers:headers(key,client)}),{params:Promise.resolve({id:item.id})});
 let saved,published,entry;
 try{
  await db.query('DELETE FROM portal_memberships WHERE client_id=$1 AND user_id=$2',[B.id,f.accounts.client.id]);
  await db.query('DELETE FROM "rateLimit"');for(const key of Object.keys(f.accounts)){const a=f.accounts[key],r=await auth.api.signInUsername({body:{username:a.username,password:a.password},headers:new Headers({origin}),asResponse:true});assert.equal(r.status,200);a.cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');}
  await t.test('browser Data API roles cannot select file bytes or audit rows',async()=>{
   for(const role of ['anon','authenticated'])for(const table of ['portal_client_document_files','portal_client_document_file_audit'])assert.equal((await db.query("SELECT has_table_privilege($1,$2,'SELECT') allowed",[role,table])).rows[0].allowed,false);
  });
  await t.test('upload persists exact bytes privately, and exact/concurrent retries create no duplicates',async()=>{
   const op=crypto.randomUUID(),responses=await Promise.all([upload(op),upload(op)]);for(const response of responses)assert.equal(response.status,200);saved=await responses[0].json();assert.equal(saved.status,'saved_not_published');assert.equal(saved.title,'Synthetic audit.pdf');
   assert.equal((await db.query('SELECT count(*)::int n FROM portal_client_document_files WHERE id=$1',[saved.id])).rows[0].n,1);
   assert.equal((await db.query('SELECT count(*)::int n FROM portal_client_document_file_audit WHERE file_id=$1',[saved.id])).rows[0].n,1);
   assert.equal((await upload(op,'admin',A,false,'%PDF-1.7\nDifferent bytes')).status,409);
   assert.equal((await(await list()).json()).items.some(item=>item.id===saved.id),false);
   const r=await preview.GET(new Request(origin+`/api/admin/client-document-files/${saved.id}?clientId=${A.id}&revision=${saved.revision}&mode=view`,{headers:headers()}),{params:Promise.resolve({id:saved.id})});assert.equal(r.status,200);assert.equal(await r.text(),'%PDF-1.7\nPrivate synthetic upload');
  });
  await t.test('client/internal identities cannot upload; publish enables authenticated view and download only in its client',async()=>{
   for(const key of ['client','unrelated','internal'])assert.ok([401,403].includes((await upload(crypto.randomUUID(),key)).status));
   const body={action:'publish',clientId:A.id,id:saved.id,revision:saved.revision,operation:crypto.randomUUID()},r=await command(body);assert.equal(r.status,200);published=await r.json();assert.equal((await command(body)).status,200);
   entry=(await(await list()).json()).items.find(item=>item.id===saved.id);assert.equal(entry.delivery,'upload');assert.equal(entry.viewLabel,'View PDF');assert.match(entry.downloadUrl,/source=upload/);
   const viewed=await open(entry);assert.equal(viewed.status,200);assert.equal(viewed.headers.get('Content-Type'),'application/pdf');assert.match(viewed.headers.get('Content-Disposition'),/^inline;/);assert.match(viewed.headers.get('cache-control'),/no-store/);assert.match(viewed.headers.get('Content-Security-Policy'),/default-src 'none'/);assert.match(viewed.headers.get('Content-Security-Policy'),/frame-ancestors 'self'/);assert.equal(await viewed.text(),'%PDF-1.7\nPrivate synthetic upload');
   const download=await opening.GET(new Request(origin+entry.downloadUrl,{headers:headers('client')}),{params:Promise.resolve({id:entry.id})});assert.equal(download.status,200);assert.match(download.headers.get('Content-Disposition'),/^attachment;/);
   assert.doesNotMatch(JSON.stringify(entry),/content_hash|actor_id|content|reason/);
  });
  await t.test('copied URL, wrong client, revocation and stale revision deny before bytes leave',async()=>{
   assert.ok([401,403,404].includes((await open(entry,'unrelated',B)).status));
   await db.query("INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES($1,$2,'client_admin',true)",[B.id,f.accounts.client.id]);assert.equal((await open(entry,'client',B)).status,404);
   await db.query('UPDATE portal_memberships SET is_active=false WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);assert.ok([403,404].includes((await open(entry)).status));await db.query('UPDATE portal_memberships SET is_active=true WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);
   await db.query('UPDATE portal_admins SET is_active=false WHERE user_id=$1',[f.accounts.admin.id]);assert.equal((await open(entry)).status,404);await db.query('UPDATE portal_admins SET is_active=true WHERE user_id=$1',[f.accounts.admin.id]);
   const r=await command({action:'revoke',clientId:A.id,id:saved.id,revision:published.revision,operation:crypto.randomUUID()});assert.equal(r.status,200);saved=await r.json();assert.equal((await open(entry)).status,404);
   assert.equal((await command({action:'publish',clientId:B.id,id:saved.id,revision:saved.revision,operation:crypto.randomUUID()})).status,404);
   assert.equal((await command({action:'publish',clientId:A.id,id:saved.id,revision:'1',operation:crypto.randomUUID()})).status,409);
  });
  await t.test('one-step upload/share, editing and archive preserve explicit scope and history',async()=>{
   const r=await upload(crypto.randomUUID(),'admin',A,true);assert.equal(r.status,200);let value=await r.json();assert.equal(value.status,'published_link');
   const item=(await(await list()).json()).items.find(row=>row.id===value.id);assert.equal((await open(item)).status,200);
   const edited=await command({action:'update',clientId:A.id,id:value.id,revision:value.revision,operation:crypto.randomUUID(),title:'Updated uploaded report',description:'Approved next steps',share:true});assert.equal(edited.status,200);value=await edited.json();assert.equal((await open(item)).status,404);
   assert.equal((await(await list()).json()).items.find(row=>row.id===value.id).description,'Approved next steps');
   assert.equal((await command({action:'archive',clientId:A.id,id:value.id,revision:value.revision,operation:crypto.randomUUID()})).status,200);assert.equal((await(await list()).json()).items.some(row=>row.id===value.id),false);
   assert.equal((await db.query('SELECT count(*)::int n FROM portal_client_document_file_audit WHERE file_id=$1',[value.id])).rows[0].n,3);assert.equal((await db.query('SELECT octet_length(content) bytes FROM portal_client_document_files WHERE id=$1',[value.id])).rows[0].bytes,0);
  });
  await t.test('legacy private image bytes also support half-resolution client previews',async()=>{
   const bytes=await sharp({create:{width:120,height:80,channels:3,background:'#148'}}).png().toBuffer(),form=new FormData();form.set('clientId',String(A.id));form.set('operation',crypto.randomUUID());form.set('title','Legacy client image');form.set('description','Synthetic image');form.set('share','true');form.set('file',new File([bytes],'legacy.png',{type:'image/png'}));const h=headers();h.delete('content-type');
   const uploaded=await files.POST(new Request(origin+'/api/admin/client-document-files',{method:'POST',headers:h,body:form}));assert.equal(uploaded.status,200);const result=await uploaded.json(),item=(await(await list()).json()).items.find(x=>x.id===result.id),url=item.viewUrl+'&preview=half';
   const response=await opening.GET(new Request(origin+url,{headers:headers('client')}),{params:Promise.resolve({id:item.id})});assert.equal(response.status,200);assert.equal(response.headers.get('content-type'),'image/webp');const meta=await sharp(Buffer.from(await response.arrayBuffer())).metadata();assert.equal(meta.width,60);assert.equal(meta.height,40);
   assert.equal((await command({action:'archive',clientId:A.id,id:item.id,revision:'1',operation:crypto.randomUUID()})).status,200);
  });
  await t.test('invalid content and disallowed metadata create no stored file',async()=>{
   const before=(await db.query('SELECT count(*)::int n FROM portal_client_document_files')).rows[0].n;assert.equal((await upload(crypto.randomUUID(),'admin',A,false,'not a PDF')).status,415);
   assert.equal((await command({action:'publish',clientId:A.id,id:saved.id,revision:saved.revision,operation:crypto.randomUUID(),ownerId:f.accounts.internal.id})).status,400);
   assert.equal((await db.query('SELECT count(*)::int n FROM portal_client_document_files')).rows[0].n,before);
  });
 }finally{await db.query('DELETE FROM portal_memberships WHERE client_id=$1 AND user_id=$2',[B.id,f.accounts.client.id]);await closeAuthDatabase();await db.end();}
});
