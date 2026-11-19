import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import pg from "pg";
import {otp,mailFor} from "../../account-security/fixture.mjs";
import {contrast} from "../../../lib/agency-branding-policy.js";
const f=JSON.parse(readFileSync(process.env.AGENCY_BRANDING_FIXTURE,"utf8")),[A,B]=f.agencies;
let db;
test.beforeAll(async()=>{const u=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL);expect(u.hostname).toBe("127.0.0.1");expect(u.pathname).toBe(f.database);db=new pg.Client({connectionString:u.href});await db.connect();});
test.afterAll(async()=>{await db?.end();});
test.beforeEach(async({context})=>{await db.query('DELETE FROM "rateLimit"');await context.setExtraHTTPHeaders({origin:f.origin});await context.route('**/*',r=>new URL(r.request().url()).origin===f.origin?r.continue():r.abort('blockedbyclient'));});
async function login(page,key,agency=A){const a=f.accounts[key];await page.goto(`/portal/${agency.slug}/login`);await page.getByLabel("Username",{exact:true}).fill(a.username);await page.getByLabel("Password",{exact:true}).fill(a.password);await page.getByRole("button",{name:"Sign in to portal",exact:true}).click();if(a.totpURI){await page.waitForURL(url=>url.pathname===`/portal/${agency.slug}/mfa`);await page.getByLabel("Authenticator code",{exact:true}).fill(await otp(a.totpURI));await page.getByRole("button",{name:"Verify",exact:true}).click();await page.waitForURL(url=>url.pathname===`/portal/${agency.slug}/security`);}else await page.waitForURL(url=>url.pathname===`/portal/${agency.slug}/clients`);}
test("distinct login names/logos/palettes are readable on mobile and never fall back for unknown brand",async({page,context})=>{
 const images=[];
 for(const [i,a] of f.agencies.entries()){
  await page.setViewportSize({width:390,height:844});await page.goto(`/portal/${a.slug}/login`);await expect(page.getByRole("heading",{name:"Sign in to "+f.brands[i].portalName,exact:true})).toBeVisible();const logo=page.getByRole("img",{name:f.brands[i].portalName+" logo",exact:true});await expect(logo).toBeVisible();images.push(await logo.getAttribute("src"));
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const expected=f.brands[i].palette.primary.slice(1).match(/../g).map(x=>parseInt(x,16));
  expect(await page.getByRole("button",{name:"Sign in to portal",exact:true}).evaluate(e=>getComputedStyle(e).backgroundColor)).toBe(`rgb(${expected.join(', ')})`);expect(contrast(f.brands[i].palette.primary,f.brands[i].palette.onPrimary)).toBeGreaterThanOrEqual(4.5);expect(contrast(f.brands[i].palette.background,f.brands[i].palette.text)).toBeGreaterThanOrEqual(4.5);
 }
 expect(images[0]).not.toBe(images[1]);expect((await context.request.get('/portal/nonexistent/login')).status()).toBe(404);
});
test("branded MFA login, navigation and logout preserve identity while foreign actions deny",async({page,context})=>{
 await login(page,"ownerA");await page.getByRole("link",{name:"Agency workspace",exact:true}).click();await page.waitForURL(url=>url.pathname===`/portal/${A.slug}/clients`);await expect(page.locator('[data-agency-brand]')).toHaveAttribute("data-agency-brand",A.slug);
 await page.getByRole("link",{name:"Usage",exact:true}).click();await page.waitForURL(url=>url.pathname===`/portal/${A.slug}/usage`);expect((await context.request.get('/api/admin/agency/brand?agency='+B.slug)).status()).toBe(403);
 await page.goto(`/portal/${B.slug}/clients`);await expect(page.getByRole("heading",{name:"Agency staff access required",exact:true})).toBeVisible();
 await page.goto(`/portal/${A.slug}/clients`);await page.getByRole("button",{name:"Sign out",exact:true}).click();await page.waitForURL(url=>url.pathname===`/portal/${A.slug}/login`);
 expect((await context.request.get('/api/admin/agency/brand?agency='+A.slug)).status()).toBe(401);
});
test("owner preview is read-only until save; unsafe palette and logo cannot publish",async({page,context})=>{
 await login(page,"ownerA");await page.goto(`/portal/${A.slug}/branding`);
 await page.getByLabel("Validated logo",{exact:true}).setInputFiles({name:"harbor.png",mimeType:"image/png",buffer:Buffer.from(f.brands[0].logo,"base64")});
 await page.getByLabel("Portal name",{exact:true}).fill("Harbor Preview Draft");await page.getByRole("button",{name:"Preview branding",exact:true}).click();await expect(page.getByRole("region",{name:"Brand preview"})).toContainText("Harbor Preview Draft");await expect(page.getByRole("img",{name:"Preview logo",exact:true})).toBeVisible();
 expect((await(await context.request.get('/api/admin/agency/brand?agency='+A.slug)).json()).brand.portalName).toBe("Harbor Studio revised");
 await page.getByRole("button",{name:"Save reviewed branding",exact:true}).click();await expect(page.getByRole("status")).toContainText("saved and audited");await page.reload();await expect(page.locator("header strong").first()).toHaveText("Harbor Preview Draft");
 await page.getByLabel("Text on primary",{exact:true}).fill("#164e63");await page.getByRole("button",{name:"Preview branding",exact:true}).click();await expect(page.locator('p[role=alert]')).toContainText("4.5:1");
 await page.getByLabel("Validated logo",{exact:true}).setInputFiles({name:"logo.svg",mimeType:"image/svg+xml",buffer:Buffer.from('<svg onload="alert(1)"/>')});await expect(page.locator('p[role=alert]')).toContainText("PNG");
});
test("multi-membership agency switching partitions brand, navigation and exports",async({page,context})=>{
 await login(page,"invitee");await page.getByLabel("Active agency",{exact:true}).selectOption(B.slug);await page.waitForURL(url=>url.pathname===`/portal/${B.slug}/clients`);await expect(page.locator('[data-agency-brand]')).toHaveAttribute("data-agency-brand",B.slug);await expect(page.locator('header').first()).toContainText("Summit Collective");
 const data=await(await context.request.get('/api/admin/agency/brand?agency='+B.slug+'&download=json')).json();expect(data.identity.portalName).toBe("Summit Collective");expect(JSON.stringify(data)).not.toContain("Harbor Client");
 await page.getByLabel("Active agency",{exact:true}).selectOption(A.slug);await page.waitForURL(url=>url.pathname===`/portal/${A.slug}/clients`);await expect(page.locator('[data-agency-brand]')).toHaveAttribute("data-agency-brand",A.slug);
});
test("branded recovery captures same-origin identity and preserves it through reset; arbitrary callback ignored",async({page,context})=>{
 const a=f.accounts.staffB;await page.goto(`/portal/${B.slug}/recovery`);await page.getByLabel("Account email",{exact:true}).fill(a.email);await page.getByRole("button",{name:"Request instructions",exact:true}).click();await expect(page.getByRole("status")).toContainText("If eligible");
 const m=await mailFor(a.email,"reset");expect(m.identity.portalName).toBe("Summit Collective");expect(new URL(m.link).pathname).toBe(`/portal/${B.slug}/reset`);expect(new URL(m.link).search).toBe("");await page.goto(m.link);await expect(page.getByLabel("New password",{exact:true})).toBeVisible();expect(new URL(page.url()).hash).toBe("");await expect(page.locator('[data-agency-brand]')).toHaveAttribute("data-agency-brand",B.slug);
 const r=await context.request.post('/api/account/security?brand='+B.slug,{data:{action:"recovery",email:a.email,callbackURL:"https://foreign.invalid"}});expect(r.status()).toBe(400);
});
test("unknown/unverified/spoofed hosts deny and auth cookies are host-only",async({page,context})=>{
 await login(page,"ownerB",B);const cookies=await context.cookies();for(const c of cookies.filter(x=>/better-auth/.test(x.name))){expect(c.domain).toBe("127.0.0.1");expect(c.httpOnly).toBe(true);expect(c.sameSite).toBe("Lax");}
 for(const headers of [{host:"unknown.example"},{host:"portal.fictional-harbor.example"},{"x-forwarded-host":"foreign.example"}]){const r=await context.request.get('/portal/'+A.slug+'/login',{headers});expect(r.status()).toBe(403);expect(await r.text()).not.toContain("Harbor Studio");}
 expect((await context.request.get('/portal/'+B.slug+'/clients',{headers:{"x-agency-brand":A.slug}})).status()).toBe(200);expect((await context.request.get('/agency')).status()).toBe(404);
 expect((await context.request.post('/api/auth/sign-in/username',{headers:{origin:"https://foreign.example"},data:{username:f.accounts.ownerA.username,password:f.accounts.ownerA.password}})).status()).toBe(403);
});

test("branded invitation acceptance rejects a substituted brand before consuming the link",async({page,context})=>{
 await login(page,"ownerA");const snapshot=await(await context.request.get('/api/admin/agency?agency='+A.slug)).json();
 const issued=await context.request.post('/api/admin/agency?agency='+A.slug,{data:{action:"invite.create",account:f.accounts.ownerB.accountIdentifier,role:"staff",revision:snapshot.revision,operation:crypto.randomUUID(),reason:"Synthetic branded invitation"}});expect(issued.status()).toBe(200);expect((await issued.json()).mailCaptured).toBe(true);
 const m=await mailFor(f.accounts.ownerB.email,"invitation"),url=new URL(m.link);expect(url.pathname).toBe(`/portal/${A.slug}/invitation`);
 await context.clearCookies();await login(page,"ownerB",B);await page.goto(f.origin+`/portal/${B.slug}/invitation`+url.hash);await page.getByRole("button",{name:"Accept invitation",exact:true}).click();await expect(page.locator('p[role=alert]')).toContainText("Invitation unavailable");
 await page.goto(m.link);await page.getByRole("button",{name:"Accept invitation",exact:true}).click();await expect(page.getByRole("status")).toContainText("Invitation accepted");
});
