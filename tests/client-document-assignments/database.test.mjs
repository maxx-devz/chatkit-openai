import {test} from "node:test";
import assert from "node:assert/strict";
import pg from "pg";
import {writeFile} from "node:fs/promises";
import {createAssignmentFixture} from "./fixture.mjs";
test("Functional document assignments use real auth and disposable PostgreSQL",{skip:!process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL},async t=>{
 const operator=new URL(process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL),runtime=new URL(process.env.DATABASE_URL),origin=process.env.BETTER_AUTH_URL;
 assert.equal(operator.hostname,"127.0.0.1");assert.match(operator.pathname,/^\/aoc_documents_[a-f0-9]{10}$/);assert.equal(operator.host,runtime.host);assert.equal(operator.pathname,runtime.pathname);assert.notEqual(operator.username,runtime.username);
 const db=new pg.Client({connectionString:operator.href});await db.connect();
 const {createPortalAuth,closeAuthDatabase}=await import("../../lib/auth.js"),{databasePool}=await import("../../lib/database.js");
 const auth=createPortalAuth({allowAccountCreation:true,useNextCookies:false}),api=await import("../../app/api/admin/client-document-assignments/route.js");
 try{
  const f=await createAssignmentFixture(db,auth,origin);
  for(const a of Object.values(f.accounts)){
   const signed=await auth.api.signInUsername({body:{username:a.username,password:a.password},headers:new Headers({origin}),asResponse:true});assert.equal(signed.status,200);
   a.cookie=signed.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");a.session=(await auth.api.getSession({headers:new Headers({cookie:a.cookie})})).session.id;
  }
  const headers=(key="admin")=>new Headers({origin,host:new URL(origin).host,"content-type":"application/json",cookie:f.accounts[key]?.cookie||""});
  const get=(key="admin",id=f.clients[0].id)=>api.GET(new Request(origin+"/api/admin/client-document-assignments"+(id?"?clientId="+id:""),{headers:headers(key)}));
  const post=(body,key="admin",extra={})=>api.POST(new Request(origin+"/api/admin/client-document-assignments",{method:"POST",headers:new Headers({...Object.fromEntries(headers(key)),...extra}),body:JSON.stringify(body)}));
  const command=(extra={})=>({action:"save",clientId:f.clients[0].id,title:"A_PRIVATE_REFERENCE",url:"https://drive.google.com/drive/folders/fixtureFolderA123",stage:4,reason:"Automated metadata check only",operation:crypto.randomUUID(),...extra});
  const legacy=(await db.query("SELECT to_jsonb(c) data FROM portal_clients c ORDER BY id")).rows;let saved;
  await t.test("authorized list/save persists a draft and exact retries create one record and audit",async()=>{
   const response=await get();assert.equal(response.status,200);assert.match(response.headers.get("cache-control"),/no-store/);assert.equal((await response.json()).clients.length,2);
   const body=command(),r=await post(body);assert.equal(r.status,200);saved=await r.json();assert.equal(saved.status,"saved_not_published");assert.equal((await post(body)).status,200);
   assert.equal((await db.query("SELECT count(*)::int n FROM portal_client_document_assignments")).rows[0].n,1);assert.equal((await db.query("SELECT count(*)::int n FROM portal_client_document_assignment_audit")).rows[0].n,1);
   assert.equal((await(await get()).json()).assignments[0].title,"A_PRIVATE_REFERENCE");assert.deepEqual((await(await get("admin",f.clients[1].id)).json()).assignments,[]);
  });
  await t.test("client, unrelated and internal identities cannot enumerate or mutate admin data",async()=>{
   for(const key of ["client","internal","unrelated","anonymous"]){const r=await get(key);assert.ok([401,403].includes(r.status));assert.doesNotMatch(await r.text(),/A_PRIVATE_REFERENCE|fixtureFolderA123|Boundary client/);assert.ok([401,403].includes((await post(command(),key)).status));}
  });
  await t.test("client substitution, duplicate ownership, unsafe input and mass assignment leave no partial writes",async()=>{
   const snapshot=(await db.query("SELECT to_jsonb(a) data FROM portal_client_document_assignments a ORDER BY id")).rows;
   assert.equal((await post(command({id:saved.id,revision:saved.revision,clientId:f.clients[1].id}))).status,404);
   assert.equal((await post(command({clientId:f.clients[1].id}))).status,409);
   for(const extra of [{published:true},{ownerId:f.accounts.admin.id},{url:"https://evil.example/file"},{stage:99}])assert.equal((await post({...command(),...extra})).status,400);
   assert.equal((await post(command(),"admin",{"x-aoc-document-client":f.clients[1].id})).status,409);
   assert.deepEqual((await db.query("SELECT to_jsonb(a) data FROM portal_client_document_assignments a ORDER BY id")).rows,snapshot);
  });
  await t.test("origin/host forgery denies; stale revisions and request-id substitution cannot overwrite",async()=>{
   assert.equal((await post(command(),"admin",{origin:"https://foreign.example"})).status,403);
   assert.equal((await post(command(),"admin",{host:"foreign.example"})).status,403);
   const body=command({id:saved.id,revision:saved.revision,title:"A_PRIVATE_UPDATED"});const r=await post(body);assert.equal(r.status,200);const edited=await r.json();
   assert.equal((await post({...body,operation:crypto.randomUUID()})).status,409);assert.equal((await post({...body,title:"DIFFERENT_BODY"})).status,409);saved=edited;
  });
  await t.test("revoked admin/session state is rechecked without deleting unrelated memberships",async()=>{
   await db.query("UPDATE portal_admins SET is_active=false WHERE user_id=$1",[f.accounts.admin.id]);assert.equal((await post(command())).status,403);await db.query("UPDATE portal_admins SET is_active=true WHERE user_id=$1",[f.accounts.admin.id]);
   await db.query(`UPDATE "session" SET "expiresAt"=now()-interval '1 minute' WHERE id=$1`,[f.accounts.admin.session]);assert.equal((await post(command())).status,401);const renewed=await auth.api.signInUsername({body:{username:f.accounts.admin.username,password:f.accounts.admin.password},headers:new Headers({origin}),asResponse:true});assert.equal(renewed.status,200);f.accounts.admin.cookie=renewed.headers.getSetCookie().map(c=>c.split(";")[0]).join("; ");
   assert.equal((await db.query("SELECT count(*)::int n FROM portal_memberships WHERE user_id=$1 AND is_active",[f.accounts.client.id])).rows[0].n,1);
  });
  await t.test("removal is audited and idempotent; legacy clients and role limits are preserved",async()=>{
   const body={action:"archive",clientId:f.clients[0].id,id:saved.id,revision:saved.revision,operation:crypto.randomUUID(),reason:"Finish metadata-only acceptance check"};assert.equal((await post(body)).status,200);assert.equal((await post(body)).status,200);
   assert.equal((await(await get()).json()).assignments.length,0);assert.equal((await db.query("SELECT count(*)::int n FROM portal_client_document_assignment_audit")).rows[0].n,3);
   assert.deepEqual((await db.query("SELECT to_jsonb(c) data FROM portal_clients c ORDER BY id")).rows,legacy);
   assert.equal((await databasePool.query("SELECT current_user=session_user clean,has_table_privilege(current_user,'portal_client_document_assignment_audit','UPDATE') audit_update")).rows[0].clean,true);
   assert.equal((await databasePool.query("SELECT has_table_privilege(current_user,'portal_client_document_assignment_audit','UPDATE') allowed")).rows[0].allowed,false);
  });
  await writeFile(process.env.CLIENT_DOCUMENTS_FIXTURE,JSON.stringify(f),{mode:0o600});
 }finally{await closeAuthDatabase();await db.end();}
});
