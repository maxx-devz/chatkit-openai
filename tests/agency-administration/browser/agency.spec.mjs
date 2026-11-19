import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const f=JSON.parse(readFileSync(process.env.AGENCY_ADMIN_FIXTURE,'utf8')),[A,B]=f.agencies,[A1,A2,B1]=f.clients;
let db;
test.beforeAll(async()=>{const u=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL);expect(u.hostname).toBe('127.0.0.1');expect(u.pathname).toBe(f.database);db=new pg.Client({connectionString:u.href});await db.connect();});
test.afterAll(async()=>{await db?.end();});
test.beforeEach(async({context})=>{await db.query('DELETE FROM "rateLimit"');await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort('blockedbyclient'));});
async function login(page,key){const a=f.accounts[key];await page.goto('/login');await page.getByRole('textbox',{name:'Username',exact:true}).fill(a.username);await page.getByLabel('Password',{exact:true}).fill(a.password);await page.getByRole('button',{name:/sign in to portal/i}).click();await page.waitForURL(url=>url.pathname==='/');}
async function open(page,agency=A,view='clients'){await page.goto(`/admin/agency/${view}?agency=${agency.slug}`);await expect(page.getByRole('heading',{name:`${agency.name} · ${view==='clients'?'Clients':view==='staff'?'Staff & access':view==='usage'?'Usage':view==='audit'?'Audit':view==='sources'?'Sources & connections':'Agency settings'}`,exact:true})).toBeVisible();}
test('two owner workspaces expose only their own clients, staff, settings, usage and audit',async({page,context})=>{
 for(const [key,agency,own,foreign,support] of [['ownerA',A,A1,B1,'Harbor Support revised'],['ownerB',B,B1,A1,'S13_B_SUPPORT']]){
  await context.clearCookies();await login(page,key);await open(page,agency);await expect(page.getByText(own.name,{exact:true})).toBeVisible();await expect(page.getByText(foreign.name,{exact:true})).toHaveCount(0);
  for(const view of ['staff','settings','usage','audit','sources']){await open(page,agency,view);expect(await page.textContent('body')).not.toMatch(/S11_CANARY|PRIVATE_ADMIN|AGENCY_A_ONLY|encrypted_refresh_token/);}
  await open(page,agency,'settings');await expect(page.getByText('Support: '+support,{exact:true})).toBeVisible();
  const response=await context.request.get('/api/admin/agency?agency='+(agency===A?B.slug:A.slug));expect(response.status()).toBe(403);expect(await response.text()).not.toContain(foreign.name);
 }
});
test('delivery staff see assigned clients and no owner/admin controls; direct mutation denied',async({page,context})=>{
 await login(page,'staffA');await open(page);await expect(page.getByText(A1.name,{exact:true})).toBeVisible();await expect(page.getByText(A2.name,{exact:true})).toHaveCount(0);
 await expect(page.getByRole('button',{name:'Create client',exact:true})).toHaveCount(0);
 await open(page,A,'settings');await expect(page.getByRole('button',{name:'Transfer ownership',exact:true})).toHaveCount(0);
 const current=await(await context.request.get('/api/admin/agency?agency='+A.slug)).json();expect(current.usage.costs).toBeNull();
 const denied=await context.request.post('/api/admin/agency?agency='+A.slug,{data:{action:'client.create',slug:'forged-staff',name:'Invalid',revision:current.revision,reason:'Forged UI',operation:crypto.randomUUID()}});expect(denied.status()).toBe(403);
 expect((await context.request.get('/api/platform/agencies')).status()).toBe(403);expect((await context.request.get('/agency')).status()).toBe(404);
});
test('owner creates a scoped client through reused administration components',async({page,context})=>{
 await login(page,'ownerA');await open(page);await page.getByRole('button',{name:'Create client',exact:true}).click();const dialog=page.getByRole('dialog');
 await dialog.getByLabel('Client name',{exact:true}).fill('Harbor Browser Client');await dialog.getByLabel('Client slug',{exact:true}).fill('s13-browser-client');await dialog.getByLabel('Reason',{exact:true}).fill('Synthetic browser creation');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByText('Harbor Browser Client',{exact:true})).toBeVisible();
 const own=(await db.query("SELECT o.agency_id::text FROM agency_platform.client_ownership o JOIN portal_clients c ON c.id=o.client_id WHERE c.slug='s13-browser-client'")).rows[0];expect(own.agency_id).toBe(A.id);
 const foreign=await context.request.post('/api/admin/agency?agency='+B.slug,{data:{action:'client.create',slug:'forged-cross',name:'Invalid'}});expect(foreign.status()).toBe(403);
});
test('platform-only and client-admin accounts cannot enter agency administration',async({page,context})=>{
 for(const key of ['platformOnly','clientA']){await context.clearCookies();await login(page,key);await page.goto('/admin/agency?agency='+A.slug);await expect(page.getByRole('heading',{name:'Agency staff access required',exact:true})).toBeVisible();expect((await context.request.get('/api/admin/agency?agency='+A.slug)).status()).toBe(403);}
});
test('ownership transfer changes controls and final owner remains protected',async({page})=>{
 await login(page,'ownerA');await open(page,A,'staff');await expect(page.getByRole('button',{name:'Manage '+f.accounts.ownerA.name,exact:true})).toHaveCount(0);
 await open(page,A,'settings');await page.getByRole('button',{name:'Transfer ownership',exact:true}).click();let dialog=page.getByRole('dialog');await dialog.getByRole('combobox',{name:'New agency owner',exact:true}).selectOption({label:f.accounts.adminA.name},{timeout:10000});await dialog.getByLabel(`Type ${A.slug} to confirm`,{exact:true}).fill(A.slug);await dialog.getByLabel('Reason',{exact:true}).fill('Synthetic browser transfer');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).toHaveCount(0);await expect(page.getByRole('button',{name:'Transfer ownership',exact:true})).toHaveCount(0);
 await db.query('BEGIN');await db.query('UPDATE agency_platform.agency_governance SET owner_id=$1 WHERE agency_id=$2',[f.accounts.ownerA.id,A.id]);await db.query('UPDATE agency_platform.agency_owners SET user_id=$1 WHERE agency_id=$2',[f.accounts.ownerA.id,A.id]);await db.query('COMMIT');
});
test('workspace switching and old-tab mutations cannot carry data into a different agency',async({page,context})=>{
 await login(page,'multi');await open(page,A);await expect(page.getByText(A1.name,{exact:true})).toBeVisible();
 await page.getByRole('combobox',{name:'Active agency',exact:true}).selectOption(B.slug,{timeout:10000});await expect(page.getByText(B1.name,{exact:true})).toBeVisible();await expect(page.getByText(A1.name,{exact:true})).toHaveCount(0);
 const denied=await context.request.get('/api/admin/agency?agency='+B.slug,{headers:{'x-aoc-agency-admin':A.id}});expect(denied.status()).toBe(409);
 await page.goBack();await expect(page.getByText(B1.name,{exact:true})).toHaveCount(0);
});
test('open agency view rechecks revoked membership and removes the prior client list',async({page,context})=>{
 await login(page,'staffA');await open(page);
 try{await db.query('UPDATE agency_platform.memberships SET is_active=false WHERE agency_id=$1 AND user_id=$2',[A.id,f.accounts.staffA.id]);expect((await context.request.get('/api/admin/agency?agency='+A.slug)).status()).toBe(403);await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.getByRole('heading',{name:'Agency staff access required',exact:true})).toBeVisible();await expect(page.getByText(A1.name,{exact:true})).toHaveCount(0);}
 finally{await db.query('UPDATE agency_platform.memberships SET is_active=true WHERE agency_id=$1 AND user_id=$2',[A.id,f.accounts.staffA.id]);}
});
test('invitation UI requires the named recipient to accept before agency access appears',async({browser})=>{
 const ownerContext=await browser.newContext({baseURL:f.origin}),recipientContext=await browser.newContext({baseURL:f.origin});
 try{
  for(const context of [ownerContext,recipientContext])await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort('blockedbyclient'));
  const owner=await ownerContext.newPage(),recipient=await recipientContext.newPage();
  await login(owner,'ownerA');await open(owner,A,'staff');await owner.getByRole('button',{name:'Invite account',exact:true}).click();const dialog=owner.getByRole('dialog');await dialog.getByLabel('Existing account identifier',{exact:true}).fill(f.accounts.unrelated.accountIdentifier);await dialog.getByLabel('Reason',{exact:true}).fill('Synthetic browser invitation');await dialog.getByRole('button',{name:'Save changes',exact:true}).click();await expect(dialog).toHaveCount(0);
  await login(recipient,'unrelated');expect((await recipientContext.request.get('/api/admin/agency?agency='+A.slug)).status()).toBe(403);
  await recipient.goto('/admin/agency/invitations');await recipient.getByRole('button',{name:'Accept '+A.name+' invitation',exact:true}).click();await expect(recipient.getByRole('heading',{name:A.name+' · Clients',exact:true})).toBeVisible();
  await expect(recipient.getByText(A1.name,{exact:true})).toHaveCount(0);expect((await recipientContext.request.get('/api/platform/agencies')).status()).toBe(403);
 }finally{await Promise.allSettled([ownerContext.close(),recipientContext.close()]);}
});
test('role downgrade removes management controls from an already-open agency session',async({page,context})=>{
 await login(page,'adminA');await open(page);await expect(page.getByRole('button',{name:'Create client',exact:true})).toBeVisible();
 try{await db.query("UPDATE agency_platform.memberships SET role='staff' WHERE agency_id=$1 AND user_id=$2",[A.id,f.accounts.adminA.id]);await page.getByRole('button',{name:'Search',exact:true}).click();await expect(page.getByRole('button',{name:'Create client',exact:true})).toHaveCount(0);const view=await(await context.request.get('/api/admin/agency?agency='+A.slug)).json();expect(view.actor.role).toBe('staff');expect((await context.request.post('/api/admin/agency?agency='+A.slug,{data:{action:'client.create',slug:'downgrade-attempt',name:'Invalid',reason:'Stale signed in role',revision:view.revision,operation:crypto.randomUUID()}})).status()).toBe(403);}
 finally{await db.query("UPDATE agency_platform.memberships SET role='agency_admin' WHERE agency_id=$1 AND user_id=$2",[A.id,f.accounts.adminA.id]);}
});
