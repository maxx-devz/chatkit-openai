import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import pg from 'pg';
const f=JSON.parse(readFileSync(process.env.SPECIALIST_FIXTURE,'utf8')),[A,B]=f.agencies;
const accounts={...f.accounts,...f.specialists};let db;
test.beforeAll(async()=>{const u=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL);expect(u.hostname).toBe('127.0.0.1');expect(u.pathname).toBe(f.database);db=new pg.Client({connectionString:u.href});await db.connect();});
test.afterAll(async()=>{await db?.end();});
test.beforeEach(async({context})=>{await db.query('DELETE FROM "rateLimit"');await context.route('**/*',route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort('blockedbyclient'));});
async function login(page,key){await page.goto('/login');await page.getByRole('textbox',{name:'Username',exact:true}).fill(accounts[key].username);await page.getByLabel('Password',{exact:true}).fill(accounts[key].password);await page.getByRole('button',{name:/sign in to portal/i}).click();await page.waitForURL(url=>url.pathname==='/');}
test('specialist chooses separate approved scopes and downloads only approved private files',async({page,context})=>{
 await login(page,'specialistA');await page.goto('/delivery');await expect(page.getByRole('heading',{name:'Your approved assignments',exact:true})).toBeVisible();
 for(const id of f.active.slice(0,2)){
  await page.goto('/delivery?assignment='+id);await expect(page.getByRole('heading',{name:/Scoped specialist/})).toBeVisible();expect(await page.textContent('body')).not.toContain(f.hrCanary);
  const other=f.active[0]===id?f.deliveryFiles[1]:f.deliveryFiles[0];expect((await context.request.get('/api/delivery/files/'+other.id+'?assignment='+id)).status()).toBe(403);
 }
 const own=await context.request.get('/api/delivery/files/'+f.deliveryFiles[0].id+'?assignment='+f.active[0]);expect(own.status()).toBe(200);expect(own.headers()['cache-control']).toContain('no-store');
 expect((await context.request.get('/api/admin/agency?agency='+A.slug)).status()).toBe(403);expect((await context.request.get('/api/ai-access')).status()).toBe(403);expect((await context.request.get('/agency')).status()).toBe(404);
});
test('manager, unrelated specialist and Internal identity receive no automatic delivery access',async({page,context})=>{
 for(const key of ['whitecapManager','specialistB','internalSpecialist']){
  await context.clearCookies();await login(page,key);await page.goto('/delivery?assignment='+f.active[0]);await expect(page.getByRole('heading',{name:'Active specialist assignment required',exact:true})).toBeVisible();
  expect((await context.request.get('/api/delivery?assignment='+f.active[0])).status()).toBe(403);expect(await page.textContent('body')).not.toContain(f.hrCanary);
 }
});
test('notes require the approved action and display no private personnel data',async({page,context})=>{
 await login(page,'specialistA');await page.goto('/delivery?assignment='+f.active[0]);await page.getByLabel('Delivery note',{exact:true}).fill('Synthetic business delivery note');await page.getByRole('button',{name:'Save delivery note',exact:true}).click();await expect(page.getByText('Synthetic business delivery note',{exact:true})).toBeVisible();
 const body=await page.textContent('body');expect(body).not.toContain(f.hrCanary);expect(body).not.toMatch(/salary|coaching assessment|leave reason/i);
 const denied=await context.request.post('/api/admin/agency/specialists?agency='+A.slug,{data:{action:'assignment.create',role:'agency_admin'}});expect(denied.status()).toBe(403);
});
test('agency admin creates a separate engagement and approves explicit delivery actions',async({page})=>{
 await login(page,'ownerA');await page.goto('/admin/agency/specialists?agency='+A.slug);await expect(page.getByRole('heading',{name:'Staffing engagements',exact:true})).toBeVisible();
 await page.getByLabel('Existing specialist account identifier (optional)',{exact:true}).fill(accounts.whitecapManager.accountIdentifier);await page.getByLabel('Engagement reference',{exact:true}).fill('Browser engagement only');await page.getByLabel('Engagement reason',{exact:true}).fill('Synthetic reference without access');await page.getByRole('button',{name:'Record engagement',exact:true}).click();await expect(page.getByText(/Browser engagement only/).first()).toBeVisible();
 await page.getByRole('combobox',{name:'Assignment engagement',exact:true}).selectOption(f.engagements[0].id);await page.getByRole('combobox',{name:'Assignment client',exact:true}).selectOption(f.clients[0].id);
 for(const [label,value] of [['Delivery role','Browser scoped specialist'],['Responsibilities','Review the approved client brief'],['Deliverables','Return a business delivery note'],['Handoff context','Approved business context'],['Approval reason','Synthetic approval by agency administrator']])await page.getByLabel(label,{exact:true}).fill(value);
 const date=new Date(Date.now()+86400000);await page.getByLabel('Expires at',{exact:true}).fill(date.toISOString().slice(0,16));await page.getByRole('button',{name:'Approve assignment',exact:true}).click();await expect(page.getByText('Browser scoped specialist',{exact:true})).toBeVisible();
});
test('expiry and revoked sessions invalidate an open delivery page and copied URLs',async({page,context})=>{
 await login(page,'specialistA');const id=f.active[1];await page.goto('/delivery?assignment='+id);
 const original=(await db.query('SELECT created_at,expires_at FROM agency_platform.specialist_assignments WHERE id=$1',[id])).rows[0];
 try{await db.query("UPDATE agency_platform.specialist_assignments SET created_at=now()-interval '2 minutes',expires_at=now()-interval '1 minute' WHERE id=$1",[id]);expect((await context.request.get('/api/delivery?assignment='+id)).status()).toBe(403);await page.getByRole('button',{name:'Check assignment access',exact:true}).click();await expect(page.getByRole('heading',{name:/Scoped specialist/})).toHaveCount(0);}
 finally{await db.query('UPDATE agency_platform.specialist_assignments SET created_at=$2,expires_at=$3 WHERE id=$1',[id,original.created_at,original.expires_at]);}
 await db.query('DELETE FROM "session" WHERE "userId"=$1',[accounts.specialistA.accountIdentifier]);expect((await context.request.get('/api/delivery?assignment='+id)).status()).toBe(401);
});
test('replacement and engagement end revoke existing specialist context',async({page,context})=>{
 await login(page,'specialistB');const id=f.active[2];await page.goto('/delivery?assignment='+id);await expect(page.getByRole('heading',{name:/Scoped specialist/})).toBeVisible();
 await db.query("UPDATE agency_platform.specialist_assignments SET status='replaced',revision=revision+1 WHERE id=$1",[id]);expect((await context.request.get('/api/delivery?assignment='+id)).status()).toBe(403);expect((await context.request.get('/api/delivery/files/'+f.deliveryFiles[0].id+'?assignment='+id)).status()).toBe(403);
 await page.getByRole('button',{name:'Check assignment access',exact:true}).click();await expect(page.getByRole('heading',{name:/Scoped specialist/})).toHaveCount(0);
});
test('administrator replacement and engagement-end controls work through the UI',async({page,context})=>{
 await login(page,'ownerA');await page.goto('/admin/agency/specialists?agency='+A.slug);
 await page.getByRole('button',{name:'Replace '+f.assignmentInputs[0].role,exact:true}).click();
 await page.getByRole('combobox',{name:'Assignment engagement',exact:true}).selectOption(f.engagements[2].id);
 for(const [label,value] of [['Delivery role','Browser replacement specialist'],['Responsibilities','Approved replacement work'],['Deliverables','Replacement handoff'],['Approval reason','Temporary coverage approved by agency']])await page.getByLabel(label,{exact:true}).fill(value);
 await page.getByLabel('Expires at',{exact:true}).fill(new Date(Date.now()+86400000).toISOString().slice(0,16));await page.getByRole('button',{name:'Approve replacement',exact:true}).click();await expect(page.getByText('Browser replacement specialist',{exact:true})).toBeVisible();
 expect((await db.query('SELECT status FROM agency_platform.specialist_assignments WHERE id=$1',[f.active[0]])).rows[0].status).toBe('replaced');
 const replacement=(await db.query("SELECT id FROM agency_platform.specialist_assignments WHERE role_label='Browser replacement specialist'")).rows[0].id;
 page.once('dialog',dialog=>dialog.accept('Synthetic engagement end through UI'));await page.getByRole('button',{name:'End Synthetic Whitecap specialistB',exact:true}).click();
 await expect(page.getByRole('button',{name:'Revoke Browser replacement specialist',exact:true})).toHaveCount(0);
 await context.clearCookies();await login(page,'specialistB');expect((await context.request.get('/api/delivery?assignment='+replacement)).status()).toBe(403);
});
