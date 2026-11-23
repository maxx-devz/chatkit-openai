import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
const f=JSON.parse(readFileSync(process.env.CLIENT_DOCUMENTS_FIXTURE,'utf8'));
const title='SERVER_AUTHORIZED_'+randomUUID();let db,documentId;
async function login(request,key){const a=f.accounts[key];const r=await request.post(f.origin+'/api/auth/sign-in/username',{headers:{origin:f.origin},data:{username:a.username,password:a.password}});expect(r.status()).toBe(200);}
test.beforeAll(async({request})=>{
 const u=new URL(process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL);
 expect(u.hostname).toBe('127.0.0.1');expect(u.pathname).toBe('/'+f.database);expect(u.pathname).toMatch(/^\/aoc_documents_[a-f0-9]{10}$/);
 db=new pg.Client({connectionString:u.href});await db.connect();await db.query('DELETE FROM "rateLimit"');
 await login(request,'admin');
 const saved=await request.post(f.origin+'/api/admin/client-document-assignments',{headers:{origin:f.origin},data:{action:'save',clientId:f.clients[0].id,title,description:'Synthetic approved material; no Google network call.',url:'https://docs.google.com/document/d/ServerFixture'+randomUUID().replaceAll('-','')+'/edit',reason:'Server rendering regression check',operation:randomUUID()}});
 expect(saved.status()).toBe(200);const doc=await saved.json();documentId=doc.id;
 const published=await request.post(f.origin+'/api/admin/client-document-assignments',{headers:{origin:f.origin},data:{action:'publish',clientId:f.clients[0].id,id:doc.id,revision:doc.revision,confirmed:true,reason:'Publish synthetic test material',operation:randomUUID()}});expect(published.status()).toBe(200);
});
test.afterAll(async()=>{try{if(documentId)await db.query('UPDATE portal_client_document_assignments SET archived_at=now(),revision=revision+1 WHERE id=$1',[documentId]);}finally{await db?.end();}});
test.beforeEach(async()=>{await db.query('DELETE FROM "rateLimit"');});
async function restrict(context){await context.route('**/*',r=>{const u=new URL(r.request().url());return u.origin!==f.origin||u.pathname==='/api/client-documents'?r.abort('blockedbyclient'):r.continue();});}
test('real authenticated library survives blocked initial API and reload',async({context,page})=>{
 await restrict(context);await login(context.request,'client');const requests=[];page.on('request',r=>{if(new URL(r.url()).pathname==='/api/client-documents')requests.push(r.url());});
 await page.goto('/?view=documents');await expect(page.getByText(title,{exact:true})).toBeVisible();await expect(page.getByText('Loading your documents...',{exact:true})).toHaveCount(0);
 await page.reload();await expect(page.getByText(title,{exact:true})).toBeVisible();expect(requests).toEqual([]);
});
test('real authenticated library is readable with JavaScript disabled',async({browser})=>{
 const context=await browser.newContext({javaScriptEnabled:false,extraHTTPHeaders:{origin:f.origin}});
 try{await restrict(context);await login(context.request,'client');const page=await context.newPage();await page.goto(f.origin+'/?view=documents');await expect(page.getByText(title,{exact:true})).toBeVisible();await expect(page.getByRole('link',{name:'Open in Google Docs',exact:true}).first()).toBeVisible();}finally{await context.close();}
});
test('another signed-in client never receives the server-rendered document',async({context,page})=>{
 await restrict(context);await login(context.request,'unrelated');const response=await page.goto('/?view=documents');await expect(page.getByRole('heading',{name:'Document Library',exact:true})).toBeVisible();await expect(page.getByText(title,{exact:true})).toHaveCount(0);expect(await response.text()).not.toContain(title);
});
test('revoking membership removes documents on reload with an existing session',async({context,page})=>{
 await restrict(context);await login(context.request,'client');await page.goto('/?view=documents');await expect(page.getByText(title,{exact:true})).toBeVisible();
 const changed=await db.query('UPDATE portal_memberships SET is_active=false WHERE user_id=$1 AND client_id=$2 AND is_active RETURNING user_id,client_id',[f.accounts.client.id,f.clients[0].id]);expect(changed.rowCount).toBeGreaterThan(0);
 try{const response=await page.reload();await expect(page.getByRole('heading',{name:'Portal access needs attention',exact:true})).toBeVisible();await expect(page.getByText(title,{exact:true})).toHaveCount(0);expect(await response.text()).not.toContain(title);}finally{await db.query('UPDATE portal_memberships SET is_active=true WHERE user_id=$1 AND client_id=$2',[f.accounts.client.id,f.clients[0].id]);}
});
