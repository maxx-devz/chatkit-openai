import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import pg from "pg";
const f=JSON.parse(readFileSync(process.env.CLIENT_DOCUMENTS_FIXTURE,"utf8")),[A,B]=f.clients;let db;
test.beforeAll(async()=>{const u=new URL(process.env.CLIENT_DOCUMENTS_TEST_DATABASE_URL);expect(u.hostname).toBe("127.0.0.1");expect(u.pathname).toBe("/"+f.database);db=new pg.Client({connectionString:u.href});await db.connect();await db.query('UPDATE portal_client_document_assignments SET archived_at=now(),revision=revision+1 WHERE archived_at IS NULL');});
test.afterAll(async()=>{await db?.end();});
test.beforeEach(async({context})=>{await db.query('DELETE FROM "rateLimit"');await context.setExtraHTTPHeaders({origin:f.origin});await context.route('**/*',r=>new URL(r.request().url()).origin===f.origin?r.continue():r.abort('blockedbyclient'));});
async function login(context,key="admin"){const a=f.accounts[key];const r=await context.request.post('/api/auth/sign-in/username',{data:{username:a.username,password:a.password}});expect(r.status()).toBe(200);}
async function open(page,context,id=A.id){await login(context);await page.goto('/admin/client-documents');await page.getByLabel('Client account',{exact:true}).selectOption(id);await expect(page.getByRole('heading',{name:'Add document',exact:true})).toBeVisible();}
async function fill(page,title,link){await page.getByLabel('Document title',{exact:true}).fill(title);await page.getByLabel('Google Drive file link',{exact:true}).fill(link);}
test('admin saves an original Drive reference and reloads it without a Google request',async({page,context})=>{
 const outbound=[];page.on('request',r=>{if(/googleapis|drive\.google/.test(r.url()))outbound.push(r.url());});await open(page,context);
 await fill(page,'BROWSER_A_REFERENCE','https://drive.google.com/drive/folders/browserFolderA123');await page.getByLabel('Description',{exact:true}).fill('Approved report and reference materials.');await page.getByRole('button',{name:'Save document',exact:true}).click();
 await expect(page.getByRole('status')).toContainText('not published');await page.reload();await page.getByLabel('Client account',{exact:true}).selectOption(A.id);await expect(page.getByText('BROWSER_A_REFERENCE',{exact:true})).toBeVisible();
 await expect(page.getByText('Private draft',{exact:true})).toBeVisible();expect(outbound).toEqual([]);await page.screenshot({path:test.info().outputPath('desktop-form.png'),fullPage:true});
});
test('edit and client switching preserve the right saved record and local drafts',async({page,context})=>{
 await open(page,context);await page.getByRole('button',{name:'Edit',exact:true}).click();await expect(page.getByLabel('Document title',{exact:true})).toHaveValue('BROWSER_A_REFERENCE');await page.getByLabel('Document title',{exact:true}).fill('BROWSER_A_EDITED');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByText('BROWSER_A_EDITED',{exact:true})).toBeVisible();
 await page.getByLabel('Client account',{exact:true}).selectOption(B.id);await expect(page.getByText('No reference assigned yet',{exact:true})).toBeVisible();await expect(page.getByText('BROWSER_A_EDITED',{exact:true})).toHaveCount(0);
 await fill(page,'BROWSER_B_DRAFT','https://docs.google.com/document/d/browserDocB123456/edit');await page.getByLabel('Client account',{exact:true}).selectOption(A.id);await expect(page.getByLabel('Document title',{exact:true})).toHaveValue('');await page.getByLabel('Client account',{exact:true}).selectOption(B.id);await expect(page.getByLabel('Document title',{exact:true})).toHaveValue('BROWSER_B_DRAFT');
 await page.getByRole('button',{name:'Save document',exact:true}).click();await expect(page.getByText('BROWSER_B_DRAFT',{exact:true})).toBeVisible();
});
test('stale edits reject instead of silently overwriting another admin change',async({page,context})=>{
 await open(page,context);await page.getByRole('button',{name:'Edit',exact:true}).click();const current=(await(await context.request.get('/api/admin/client-document-assignments?clientId='+A.id)).json()).assignments[0];
 const r=await context.request.post('/api/admin/client-document-assignments',{data:{action:'save',clientId:A.id,id:current.id,revision:current.revision,title:'OTHER_VERIFIED_EDIT',url:current.url,stage:current.stage,reason:'Simulate another admin edit',operation:crypto.randomUUID()}});expect(r.status()).toBe(200);
 await page.getByLabel('Document title',{exact:true}).fill('STALE_BROWSER_EDIT');await page.getByRole('button',{name:'Save changes',exact:true}).click();await expect(page.getByRole('alert').filter({hasText:'Someone updated'})).toBeVisible();
 expect((await(await context.request.get('/api/admin/client-document-assignments?clientId='+A.id)).json()).assignments[0].title).toBe('OTHER_VERIFIED_EDIT');
});
test('removal confirms locally, retains audit and never deletes a Drive file',async({page,context})=>{
 await open(page,context);await page.getByRole('button',{name:'Remove',exact:true}).click();await expect(page.getByText('The original Drive file will stay unchanged.',{exact:false})).toBeVisible();await page.getByLabel('Reason for removal',{exact:true}).fill('Remove browser check reference');await page.getByRole('button',{name:'Confirm removal',exact:true}).click();await expect(page.getByText('No reference assigned yet',{exact:true})).toBeVisible();await page.getByText('Recent admin changes',{exact:true}).click();await expect(page.getByText('Reference removed',{exact:true}).first()).toBeVisible();
});
test('client and internal accounts are denied both direct UI and API, even with a valid login',async({page,context})=>{
 for(const key of ['client','internal','unrelated']){await context.clearCookies();await login(context,key);await page.goto('/admin/client-documents');await expect(page.getByRole('heading',{name:'AOC administrator access required',exact:true})).toBeVisible();const r=await context.request.get('/api/admin/client-document-assignments?clientId='+B.id);expect(r.status()).toBe(403);expect(await r.text()).not.toContain('BROWSER_B_DRAFT');}
});
test('revoked admin access takes effect for a previously signed-in browser',async({page,context})=>{
 await open(page,context);await db.query('UPDATE portal_admins SET is_active=false WHERE user_id=$1',[f.accounts.admin.id]);try{const r=await context.request.get('/api/admin/client-document-assignments?clientId='+A.id);expect(r.status()).toBe(403);await page.reload();await expect(page.getByRole('heading',{name:'AOC administrator access required',exact:true})).toBeVisible();}finally{await db.query('UPDATE portal_admins SET is_active=true WHERE user_id=$1',[f.accounts.admin.id]);}
});
test('mobile client search and form remain readable without horizontal overflow',async({page,context})=>{
 await page.setViewportSize({width:390,height:844});await login(context);await page.goto('/admin/client-documents');await page.getByLabel('Find a client',{exact:true}).fill('Boundary client B');await page.getByLabel('Client account',{exact:true}).selectOption(B.id);await expect(page.getByLabel('Document title',{exact:true})).toBeVisible();await expect(page.getByText('BROWSER_B_DRAFT',{exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath('mobile-form.png'),fullPage:true});
});

test('client library is simple and stored journey data is not displayed',async({page,context})=>{
 await login(context,'client');await page.goto('/?view=documents');const library=page.getByRole('region',{name:'Client document library'});
 await expect(library.getByRole('heading',{name:'Document Library',exact:true})).toBeVisible();await expect(library.getByRole('heading',{name:'Your journey',exact:true})).toHaveCount(0);await expect(library.getByRole('heading',{name:'Your next action',exact:true})).toHaveCount(0);
 await expect(library.getByText('No documents have been shared yet.',{exact:false})).toBeVisible();await expect(library.getByRole('link',{name:'Download',exact:true})).toHaveCount(0);
 await page.screenshot({path:test.info().outputPath('client-library.png'),fullPage:true});
});

test('another client cannot list or open the first client documents',async({page,context})=>{
 await login(context,'unrelated');await page.goto('/?view=documents');await expect(page.getByRole('region',{name:'Client document library'})).toBeVisible();
 const list=await context.request.get('/api/client-documents?clientId='+A.id);expect(list.status()).toBe(404);
 const file=await context.request.get('/api/client-documents/'+f.withdrawnRelease+'?clientId='+A.id+'&mode=view');expect(file.status()).toBe(404);expect(await file.text()).not.toContain('%PDF');
});

test('title search applies through the real API and mobile library stays usable',async({page,context})=>{
 await login(context,'client');await page.setViewportSize({width:390,height:844});await page.goto('/?view=documents');const library=page.getByRole('region',{name:'Client document library'});
 await expect(library.getByRole('heading',{name:'Document Library',exact:true})).toBeVisible();
 const requests=[];page.on('request',r=>{if(r.url().includes('/api/client-documents?'))requests.push(new URL(r.url()));});
 await library.getByLabel('Search document titles',{exact:true}).fill('missing audit');await library.getByRole('button',{name:'Search documents',exact:true}).click();await expect(library.getByText('No matching documents',{exact:true})).toBeVisible();
 expect(requests.some(u=>u.searchParams.get('search')==='missing audit'&&u.searchParams.get('page')==='0')).toBe(true);
 await library.getByRole('button',{name:'Clear search',exact:true}).click();await expect(library.getByText('No documents have been shared yet.',{exact:false})).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('dashboard summary links to the full document library without workflow controls',async({page,context})=>{
 await login(context,'client');await page.goto('/');const library=page.getByRole('region',{name:'Client document library'});
 await expect(library.getByRole('link',{name:'View all documents',exact:true})).toHaveAttribute('href','/?view=documents');await expect(library.getByRole('heading',{name:'Your next action',exact:true})).toHaveCount(0);
 await expect(library.getByRole('heading',{name:'Your journey',exact:true})).toHaveCount(0);
});
