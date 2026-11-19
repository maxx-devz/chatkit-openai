import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import pg from "pg";
const f=JSON.parse(readFileSync(process.env.BUSINESS_FIXTURE,"utf8"));let db;
test.beforeAll(async()=>{const u=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL);expect(u.hostname).toBe("127.0.0.1");expect(u.pathname).toBe(f.database);db=new pg.Client({connectionString:u.href});await db.connect();});
test.afterAll(async()=>{await db?.end();});
test.beforeEach(async({context,page})=>{page.on("pageerror",error=>console.log("Browser runtime error:",error.message));await db.query('DELETE FROM "rateLimit"');await context.setExtraHTTPHeaders({origin:f.origin});await context.route('**/*',r=>new URL(r.request().url()).origin===f.origin?r.continue():r.abort('blockedbyclient'));});
async function login(page,key){const a=f.accounts[key];await page.goto('/login');await page.getByLabel('Username',{exact:true}).fill(a.username);await page.getByLabel('Password',{exact:true}).fill(a.password);await page.getByRole('button',{name:'Sign in to portal',exact:true}).click();await page.waitForURL(u=>u.pathname==='/');}
test('no-Hubstaff dashboard shows evidence and unavailable metrics without Hubstaff calls',async({page})=>{
 const requests=[];page.on('request',r=>{if(new URL(r.url()).pathname.startsWith('/api/hubstaff'))requests.push(r.url());});
 await login(page,'businessA');await expect(page.getByRole('heading',{name:'Your business workspace',exact:true})).toBeVisible();
 for(const heading of ['Performance','Attention needed','Next actions','Delivered work'])await expect(page.getByRole('heading',{name:heading,exact:true})).toBeVisible();
 await expect(page.getByText('Task, tracked-time and budget metrics are unavailable.',{exact:false})).toBeVisible();
 await expect(page.getByRole('link',{name:'Monthly Time',exact:true})).toHaveCount(0);await expect(page.getByRole('link',{name:'Project Status',exact:true})).toHaveCount(0);
 expect(requests).toEqual([]);await expect(page.getByText('B16_SECRET',{exact:false})).toHaveCount(0);
 expect((await page.request.get('/agency')).status()).toBe(404);
});
test('client saves a draft, reloads and completes optional onboarding',async({page})=>{
 await login(page,'businessA');await page.goto('/?view=business');await page.getByLabel('Business description',{exact:true}).fill('Browser16 coffee shop\nFresh local context');
 await page.getByRole('button',{name:'Save draft',exact:true}).click();await expect(page.getByRole('status')).toContainText('draft saved');await page.reload();await expect(page.getByLabel('Business description',{exact:true})).toHaveValue('Browser16 coffee shop\nFresh local context');
 await page.getByRole('button',{name:'Complete basic setup',exact:true}).click();await expect(page.getByRole('status')).toContainText('onboarding complete');await page.reload();await expect(page.getByText('Basic setup complete',{exact:false})).toBeVisible();
 const foreign=await page.request.get('/api/client/business',{headers:{'x-aoc-client':f.clients[1].id}});expect(foreign.status()).not.toBe(200);expect(await foreign.text()).not.toContain('B16_SECRET');
});
test('saved website insights and exports open without Google or Hubstaff',async({page})=>{
 await login(page,'businessA');await page.goto('/?view=website-insights');await expect(page.getByRole('combobox',{name:/^Website/}).first()).toHaveValue(f.reports[0].siteId);
 await expect(page.getByText("A16_WEBSITE_TITLE",{exact:true})).toBeVisible();
 const own=await page.request.get('/api/client/website-insights?report='+f.reports[0].id);expect(own.status()).toBe(200);
 const csv=await page.request.get('/api/client/website-insights?report='+f.reports[0].id+'&download=csv');expect(csv.status()).toBe(200);expect(csv.headers()['cache-control']).toContain('no-store');
 const foreign=await page.request.get('/api/client/website-insights?report='+f.reports[1].id);expect(foreign.status()).toBe(404);expect(await foreign.text()).not.toContain('B16_SECRET');
});
test('viewer can read but cannot edit a business profile; mobile layout stays usable',async({page})=>{
 await page.setViewportSize({width:390,height:844});await login(page,'viewer');await page.goto('/?view=business');await expect(page.getByLabel('Business description',{exact:true})).toBeDisabled();await expect(page.getByRole('button',{name:'Save draft',exact:true})).toHaveCount(0);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test('workspace switching discards another client business draft and report cache',async({page})=>{
 await login(page,'multi');await page.getByRole('button',{name:/Fictional Business 1/}).click();await expect(page.getByRole('heading',{name:'Your business workspace',exact:true})).toBeVisible();await page.goto('/?view=business');await expect(page.getByLabel('Business description',{exact:true})).toHaveValue('Browser16 coffee shop\nFresh local context');
 await page.getByLabel('Active client account',{exact:true}).selectOption('s16-business-1');await expect(page.getByRole('heading',{name:'Your business workspace',exact:true})).toBeVisible();await page.goto('/?view=business');await expect(page.getByLabel('Business description',{exact:true})).toHaveValue('');
 await page.getByLabel('Active client account',{exact:true}).selectOption('s16-business-0');await expect(page.getByRole('heading',{name:'Your business workspace',exact:true})).toBeVisible();await page.goto('/?view=business');await expect(page.getByLabel('Business description',{exact:true})).toHaveValue('Browser16 coffee shop\nFresh local context');
});
