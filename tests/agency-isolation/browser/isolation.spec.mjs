import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {writeFile} from 'node:fs/promises';
import pg from 'pg';

const fixture=JSON.parse(readFileSync(process.env.AGENCY_ISOLATION_FIXTURE,'utf8'));
const {clients,accounts}=fixture;
let db;
test.beforeAll(async({browser})=>{
  console.log('Stage 11 installed Chrome:',browser.version());
  const url=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL);
  expect(url.hostname).toBe('127.0.0.1');expect(url.pathname).toBe(fixture.database);
  db=new pg.Client({connectionString:url.href});await db.connect();
  expect((await db.query('SELECT current_database() name')).rows[0].name).toBe(url.pathname.slice(1));
});
test.afterAll(async()=>{await db?.end();});
test.beforeEach(async({context})=>{
  await db.query('DELETE FROM \"rateLimit\"');
  await context.route('**/*',route=>new URL(route.request().url()).origin===fixture.origin?route.continue():route.abort('blockedbyclient'));
});
async function login(page,key,clientIndex=0) {
  await page.goto('/login');
  await page.getByRole('textbox',{name:'Username',exact:true}).fill(accounts[key].username);
  await page.getByLabel('Password',{exact:true}).fill(accounts[key].password);
  await page.getByRole('button',{name:/sign in to portal/i}).click();
  await page.waitForURL(url=>url.pathname==='/');
  if(key==='unrelated')return;
  if(accounts[key].grants.length>1)await page.getByRole('button',{name:new RegExp(clients[clientIndex].name)}).click();
  if(key==='staffB'||key==='adminB2')return;
  await expect(page.getByRole('navigation',{name:'Client portal',exact:true})).toBeVisible();
}
async function documents(page,index) {
  await page.goto('/?view=documents');
  await expect(page.getByRole('heading',{name:'Documents',exact:true,level:2})).toBeVisible();
  await expect(page.getByText(clients[index].marker,{exact:true})).toBeVisible();
}
test('real Chrome login, authorized library, private files and JSON/CSV exports',async({page,context})=>{
  await login(page,'adminA');await documents(page,0);
  for(const c of clients) {
    const response=await context.request.get('/api/client-library/'+c.file),text=await response.text();
    expect(response.status()).toBe(c===clients[0]?200:404);
    expect(response.headers()['cache-control']).toContain('no-store');
    if(c!==clients[0])expect(text).not.toContain(c.marker);
    for(const format of ['json','csv']) {
      const exported=await context.request.get(`/api/client/website-insights?report=${c.report}&download=${format}`);
      expect(exported.status()).toBe(c===clients[0]?200:404);
      if(c===clients[0])expect(await exported.text()).toContain(c.marker);
      else expect(await exported.text()).not.toContain(c.marker);
    }
  }
});
test('Viewer is usable for reads and denied a direct write despite forged role fields',async({page,context})=>{
  await login(page,'viewerA');await documents(page,0);
  await expect(page.getByRole('button',{name:'Add reference',exact:true})).toHaveCount(0);
  const response=await context.request.post('/api/client-library',{data:{title:'viewer mutation',url:'https://example.invalid/',role:'client_admin'}});
  expect(response.status()).toBe(403);
});
test('multi-agency selection and stale-tab writes stay bound to the original client',async({page,context})=>{
  await login(page,'multi',0);await documents(page,0);
  const old=await context.newPage();await documents(old,0);
  await page.getByLabel('Active client account',{exact:true}).selectOption(clients[1].slug);
  await expect(page.getByLabel('Active client account',{exact:true})).toHaveValue(clients[1].slug);
  await documents(page,1);
  const before=(await db.query('SELECT count(*)::int n FROM portal_client_library WHERE client_id=502')).rows[0].n;
  await old.getByLabel('Title',{exact:true}).fill('stale-tab-attempt');
  await old.getByLabel('HTTPS URL',{exact:true}).fill('https://example.invalid/stale');
  const rejected=old.waitForResponse(r=>r.url().endsWith('/api/client-library')&&r.request().method()==='POST');
  await old.getByRole('button',{name:'Add reference',exact:true}).click();
  expect((await rejected).status()).toBe(409);
  expect((await db.query('SELECT count(*)::int n FROM portal_client_library WHERE client_id=502')).rows[0].n).toBe(before);
  await expect(old.getByRole('alert').filter({hasText:/account changed/i})).toContainText(/account changed/i);
  await old.close();
  const own=await context.request.get('/api/client-library');expect(await own.text()).toContain(clients[1].marker);
  const foreign=await context.request.get('/api/client-library/'+clients[0].file);expect(foreign.status()).toBe(404);
});
test('unknown host, foreign selectors, unrelated identities and external agency routes deny',async({page,context})=>{
  await login(page,'adminA');
  expect((await context.request.get('/api/client-library',{headers:{Host:'untrusted.example.invalid'}})).status()).toBe(403);
  for(const path of ['/agency','/api/agency','/agency/clients','/api/agency/clients'])expect((await context.request.get(path)).status()).toBe(404);
  for(const c of clients.slice(1)) {
    const r=await context.request.get(`/api/client-library?workspaceAgency=${c.agencySlug}&workspaceClient=${c.slug}`);
    expect(r.status()).toBe(403);expect(await r.text()).not.toContain(c.marker);
  }
  await context.clearCookies();await login(page,'unrelated');
  await expect(page.getByRole('heading',{name:'Portal access needs attention'})).toBeVisible();
  expect((await context.request.get('/api/client-library')).status()).toBe(403);
});
test('Agency B login remains gated and inherits no platform connections',async({page,context})=>{
  await login(page,'staffB',2);
  await expect(page.getByRole('heading',{name:/not enabled yet/i})).toBeVisible();
  for(const path of ['/api/client-library','/api/admin/provider-settings','/api/admin/source-connections']) {
    const response=await context.request.get(path);expect(response.status()).toBe(403);
    expect(await response.text()).not.toContain(clients[0].marker);
  }
  const make=await context.request.post('/api/admin/make/test',{data:{}});expect(make.status()).toBe(403);
});
test('membership revocation and a revoked browser session invalidate copied download URLs',async({page,context})=>{
  await login(page,'memberA');await documents(page,0);
  const path='/api/client-library/'+clients[0].file;
  expect((await context.request.get(path)).status()).toBe(200);
  try {
    await db.query('UPDATE portal_memberships SET is_active=false WHERE user_id=$1 AND client_id=501',[accounts.memberA.id]);
    expect((await context.request.get(path)).status()).toBe(403);
    await page.reload();await expect(page.getByText(clients[0].marker,{exact:true})).toHaveCount(0);
  } finally {await db.query('UPDATE portal_memberships SET is_active=true WHERE user_id=$1 AND client_id=501',[accounts.memberA.id]);}
  await db.query('DELETE FROM "session" WHERE "userId"=$1',[accounts.memberA.external]);
  expect((await context.request.get(path)).status()).toBe(401);
});
test('browser back and account switch do not restore an earlier account document',async({page,context})=>{
  await login(page,'adminA');await documents(page,0);await page.goto('/?view=account');
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/login');
  // Leave ordinary page history intact while clearing the old workspace selector.
  await context.clearCookies({name:/^aoc_active_/});
  await login(page,'adminA2',1);await documents(page,1);
  for(let i=0;i<2;i++) {
    await page.goBack();await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText(clients[0].marker,{exact:true})).toHaveCount(0);
  }
  const response=await context.request.get('/api/client-library/'+clients[0].file);expect(response.status()).toBe(404);
});
test('Website Insights uses real client-bound requests and discards prior site results',async({page})=>{
  await login(page,'adminA');
  const request=page.waitForRequest(r=>new URL(r.url()).pathname==='/api/client/website-insights');
  await page.goto('/?view=website-insights&site='+clients[0].site);
  expect((await request).headers()['x-aoc-client']).toBe(clients[0].id);
  await expect(page.locator('#website-insights-title')).toBeVisible();
  await expect(page.getByRole('combobox',{name:/^Website/})).toHaveValue(clients[0].site);
  for(const c of clients.slice(1))await expect(page.getByText(c.marker,{exact:true})).toHaveCount(0);
});

test('attempt a real browser-cache restore with routing disabled across account changes',async({page,context},info)=>{
  await login(page,'adminA');await documents(page,0);
  const protocol=await context.newCDPSession(page);
  const notRestored=[];await protocol.send('Page.enable');
  protocol.on('Page.backForwardCacheNotUsed',event=>notRestored.push(...(event.notRestoredExplanations||[]).map(x=>x.reason)));
  // Keep external HTTPS/WSS requests blocked without Playwright request routing,
  // which otherwise disables the normal HTTP cache for the context.
  await protocol.send('Network.setBlockedURLs',{urls:['https://*','wss://*']});
  await context.unrouteAll({behavior:'wait'});
  await page.addInitScript(()=>{window.addEventListener('pageshow',event=>{window.__isolationPageShowPersisted=event.persisted;});});
  await documents(page,0);await page.goto('/?view=account');await page.goBack();
  await expect(page.getByText(clients[0].marker,{exact:true})).toBeVisible();
  const sameSessionPersisted=await page.evaluate(()=>window.__isolationPageShowPersisted===true);
  await page.getByRole('button',{name:'Sign out',exact:true}).click();await page.waitForURL('**/login');
  await context.clearCookies({name:/^aoc_active_/});
  await login(page,'adminA2',1);await documents(page,1);
  const restored=[];
  for(let i=0;i<2;i++) {
    await page.goBack();await page.waitForLoadState('domcontentloaded');
    await expect(page.getByText(clients[0].marker,{exact:true})).toHaveCount(0);
    await expect(page.getByText(clients[0].name,{exact:true})).toHaveCount(0);
    restored.push(await page.evaluate(()=>window.__isolationPageShowPersisted===true));
  }
  if(!sameSessionPersisted)expect(notRestored.some(reason=>reason.includes('CacheControlNoStore'))).toBe(true);
  await writeFile(info.outputPath('bfcache-observation.json'),JSON.stringify({attempted:true,sameSessionPersisted,afterAccountChangePersisted:restored,notRestored}));
});
