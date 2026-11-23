import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import pg from 'pg';

test('explicit Drive link publication uses real auth/SQL without Google configuration',{skip:!process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL},async t=>{
 const operator=new URL(process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL),runtime=new URL(process.env.DATABASE_URL);
 assert.equal(operator.hostname,'127.0.0.1');assert.match(operator.pathname,/^\/aoc_documents_[a-f0-9]{10}$/);assert.equal(operator.host,runtime.host);assert.equal(operator.pathname,runtime.pathname);assert.notEqual(operator.username,runtime.username);
 for(const name of ['CLIENT_DOCUMENTS_GOOGLE_CLIENT_ID','CLIENT_DOCUMENTS_GOOGLE_CLIENT_SECRET','CLIENT_DOCUMENTS_ENCRYPTION_KEY','CLIENT_DOCUMENTS_ALLOWED_EMAIL'])assert.ok(!process.env[name]);
 const db=new pg.Client({connectionString:operator.href});await db.connect();const f=JSON.parse(await readFile(process.env.CLIENT_DOCUMENTS_FIXTURE,'utf8')),[A,B]=f.clients;
 const {createPortalAuth,closeAuthDatabase}=await import('../../lib/auth.js'),auth=createPortalAuth({useNextCookies:false});
 const api=await import('../../app/api/admin/client-document-assignments/route.js'),library=await import('../../app/api/client-documents/route.js'),open=await import('../../app/api/client-documents/[id]/route.js');
 const origin=f.origin,headers=(key='admin',client=A)=>new Headers({host:new URL(origin).host,origin,'content-type':'application/json',cookie:(f.accounts[key]?.cookie||'')+'; aoc_active_client=docs-check-'+(client.id===A.id?'0':'1')});
 const post=(body,key='admin')=>api.POST(new Request(origin+'/api/admin/client-document-assignments',{method:'POST',headers:headers(key),body:JSON.stringify(body)}));
 const list=(key='client',client=A,query='')=>library.GET(new Request(origin+'/api/client-documents?clientId='+client.id+query,{headers:headers(key,client)}));
 const get=(key='admin',id=A.id)=>api.GET(new Request(origin+'/api/admin/client-document-assignments?clientId='+id,{headers:headers(key)}));
 const opening=(item,key='client',client=A)=>open.GET(new Request(origin+item.viewUrl,{headers:headers(key,client)}),{params:Promise.resolve({id:item.id})});
 let saved,published,link;
 try{
  await db.query('DELETE FROM "rateLimit"');
  for(const key of Object.keys(f.accounts)){
   const a=f.accounts[key],r=await auth.api.signInUsername({body:{username:a.username,password:a.password},headers:new Headers({origin}),asResponse:true});assert.equal(r.status,200);a.cookie=r.headers.getSetCookie().map(c=>c.split(';')[0]).join('; ');
  }
  await db.query("INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES($1,$2,'client_admin',true) ON CONFLICT DO NOTHING",[B.id,f.accounts.unrelated.id]);
  const before=(await db.query('SELECT to_jsonb(c) value FROM portal_clients c ORDER BY id')).rows;
  const base={action:'save',clientId:A.id,title:'LINK_A_REPORT_CANARY',description:'Website review findings and recommended next steps.',url:'https://docs.google.com/document/d/LinkFixtureA12345/edit?usp=sharing',stage:4,reason:'Fictional document reference',operation:crypto.randomUUID()};
  await t.test('saving remains private; client/internal identities cannot publish',async()=>{
   const r=await post(base);assert.equal(r.status,200);saved=await r.json();assert.equal(saved.status,'saved_not_published');assert.deepEqual((await(await list()).json()).items,[]);
   for(const key of ['client','unrelated','internal'])assert.ok([401,403].includes((await post({...base,operation:crypto.randomUUID()},key)).status));
  });
  const command=()=>({action:'publish',clientId:A.id,id:saved.id,revision:saved.revision,operation:crypto.randomUUID(),reason:'Reviewed entire fictional file and sharing',category:'report',stage:4,confirmed:true});
  await t.test('confirmation, folder restriction, foreign client IDs and revisions are enforced atomically',async()=>{
   const count=(await db.query('SELECT count(*)::int n FROM portal_client_document_assignment_audit')).rows[0].n;
   assert.equal((await post({...command(),confirmed:false})).status,400);assert.equal((await post({...command(),clientId:B.id})).status,404);assert.equal((await post({...command(),revision:'99'})).status,409);
   const folder=await(await post({...base,title:'Private folder',url:'https://drive.google.com/drive/folders/PrivateFolder12345',operation:crypto.randomUUID()})).json();assert.equal((await post({...command(),id:folder.id,revision:folder.revision})).status,400);
   assert.equal((await db.query('SELECT count(*)::int n FROM portal_client_document_assignment_audit')).rows[0].n,count+1);
  });
  await t.test('publication without OAuth is idempotent and appears only in its client library',async()=>{
   const body=command(),r=await post(body);assert.equal(r.status,200);published=await r.json();assert.equal(published.status,'published_link');assert.deepEqual(await(await post(body)).json(),published);
   const data=await(await list()).json();assert.equal(data.items.length,1);link=data.items[0];assert.equal(link.delivery,'link');assert.equal(link.viewLabel,'Open in Google Docs');assert.equal(link.downloadUrl,null);assert.equal(link.title,base.title);assert.equal(link.description,base.description);assert.equal((await(await get()).json()).assignments.find(a=>a.id===saved.id).description,base.description);assert.equal(link.stage,4);assert.equal(data.journey,null);
   assert.doesNotMatch(JSON.stringify(data),/LinkFixtureA12345|reason|actor_user_id|encrypted|source_url/);
   assert.equal((await(await get()).json()).assignments.find(a=>a.id===saved.id).status,'published_link');
   assert.deepEqual((await(await list('unrelated',B)).json()).items,[]);
   const opened=await opening(link);assert.equal(opened.status,302);assert.equal(opened.headers.get('location'),'https://docs.google.com/document/d/LinkFixtureA12345/edit');assert.match(opened.headers.get('cache-control'),/no-store/);assert.equal(opened.headers.get('referrer-policy'),'no-referrer');
  });
  await t.test('copied URLs, wrong workspace, revoked membership and publisher revocation deny without disclosure',async()=>{
   for(const [key,client] of [['unrelated',B],['internal',A],['anonymous',A]]){const r=await opening(link,key,client);assert.ok([401,403,404].includes(r.status));assert.equal(r.headers.get('location'),null);assert.doesNotMatch(await r.text(),/LinkFixtureA12345|LINK_A_REPORT_CANARY/);}
   await db.query("INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES($1,$2,'member',true)",[B.id,f.accounts.client.id]);
   assert.equal((await opening(link,'client',B)).status,404);
   await db.query('UPDATE portal_memberships SET is_active=false WHERE client_id=$1 AND user_id=$2',[A.id,f.accounts.client.id]);assert.ok([403,404].includes((await opening(link)).status));
   await db.query("UPDATE portal_memberships SET is_active=true,role='client_viewer' WHERE client_id=$1 AND user_id=$2",[A.id,f.accounts.client.id]);assert.equal((await opening(link)).status,302);
   await db.query('UPDATE portal_admins SET is_active=false WHERE user_id=$1',[f.accounts.admin.id]);assert.equal((await opening(link)).status,404);assert.deepEqual((await(await list()).json()).items,[]);await db.query('UPDATE portal_admins SET is_active=true WHERE user_id=$1',[f.accounts.admin.id]);
  });
  await t.test('search filters and pagination apply to published link metadata before paging',async()=>{
   assert.equal((await(await list('client',A,'&search=LINK_A&category=report&step=3')).json()).items.length,1);
   assert.deepEqual((await(await list('client',A,'&search='+encodeURIComponent('%'))).json()).items,[]);
   const ids=[];
   try{
    for(let i=0;i<51;i++){
     const id=crypto.randomUUID();ids.push(id);
     await db.query("INSERT INTO portal_client_document_assignments(id,client_id,kind,drive_id,source_url,title,journey_stage,revision,created_by,updated_by) VALUES($1,$2,'document',$3,$4,$5,6,2,$6,$6)",[id,A.id,'PagedLink'+String(i).padStart(12,'0'),'https://drive.google.com/file/d/PagedLink'+String(i).padStart(12,'0')+'/view','Paged link '+i,f.accounts.admin.id]);
     await db.query("INSERT INTO portal_client_document_assignment_audit(assignment_id,client_id,actor_user_id,operation,command_digest,action,reason,result) VALUES($1,$2,$3,$4,$5,'update','Fictional paging fixture',$6::jsonb)",[id,A.id,f.accounts.admin.id,crypto.randomUUID(),'a'.repeat(64),JSON.stringify({id,revision:'2',status:'published_link',category:'report'})]);
    }
    const first=await(await list('client',A,'&step=4')).json(),next=await(await list('client',A,'&step=4&page=1')).json();assert.equal(first.items.length,50);assert.equal(first.hasMore,true);assert.equal(next.items.length,1);assert.equal(next.hasMore,false);
   }finally{await db.query('DELETE FROM portal_client_document_assignment_audit WHERE assignment_id=ANY($1::uuid[])',[ids]);await db.query('DELETE FROM portal_client_document_assignments WHERE id=ANY($1::uuid[])',[ids]);}
  });
  await t.test('simple title/description requests need no category/stage and preserve scoped metadata',async()=>{
   const draft={...base,url:'https://drive.google.com/file/d/SimpleMetadata12345/view',title:'Simple description fixture',operation:crypto.randomUUID()};delete draft.stage;
   const result=await(await post(draft)).json();assert.equal(result.description,base.description);
   const approved=await(await post({action:'publish',clientId:A.id,id:result.id,revision:result.revision,operation:crypto.randomUUID(),reason:'Publish approved link',confirmed:true})).json();assert.equal(approved.status,'published_link');assert.equal(approved.description,base.description);
   const entry=(await(await list()).json()).items.find(item=>item.id===result.id);assert.equal(entry.description,base.description);assert.equal(entry.stage,null);assert.equal((await opening(entry)).status,302);
   await post({action:'archive',clientId:A.id,id:result.id,revision:approved.revision,operation:crypto.randomUUID(),reason:'Remove synthetic metadata case'});assert.equal((await opening(entry)).status,404);
  });
  await t.test('edits and unpublishing invalidate old portal links and preserve history/client IDs',async()=>{
   const unpublish={action:'revoke',clientId:A.id,id:saved.id,revision:published.revision,operation:crypto.randomUUID(),reason:'Withdraw fixture link'};
   const r=await post(unpublish);assert.equal(r.status,200);assert.equal((await opening(link)).status,404);assert.deepEqual((await(await list()).json()).items,[]);saved=await r.json();
   const republished=await(await post(command())).json();assert.equal(republished.status,'published_link');assert.equal(republished.description,base.description);
   const current=(await(await list()).json()).items[0];assert.equal((await opening(link)).status,404);assert.equal((await opening(current)).status,302);
   assert.equal((await post({...base,id:saved.id,revision:republished.revision,title:'Edited needs another approval',operation:crypto.randomUUID()})).status,200);assert.equal((await opening(current)).status,404);assert.deepEqual((await(await list()).json()).items,[]);
   assert.deepEqual((await db.query('SELECT to_jsonb(c) value FROM portal_clients c ORDER BY id')).rows,before);
   assert.equal((await db.query('SELECT count(*)::int n FROM portal_client_journey')).rows[0].n,0);
   assert.ok((await db.query("SELECT count(*)::int n FROM portal_client_document_assignment_audit WHERE assignment_id=$1",[saved.id])).rows[0].n>=5);
  });
 }finally{
  await db.query('DELETE FROM portal_memberships WHERE client_id=$1 AND user_id=ANY($2::bigint[])',[B.id,[f.accounts.client.id,f.accounts.unrelated.id]]);
  await db.query("UPDATE portal_memberships SET role='client_admin',is_active=true WHERE client_id=$1 AND user_id=$2",[A.id,f.accounts.client.id]);
  await db.query('UPDATE portal_admins SET is_active=true WHERE user_id=$1',[f.accounts.admin.id]);
  await closeAuthDatabase();await db.end();
 }
});
