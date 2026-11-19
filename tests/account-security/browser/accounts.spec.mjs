import { test,expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { randomBytes,randomUUID } from "node:crypto";
import pg from "pg";
import { otp,mailFor } from "../fixture.mjs";
const f=JSON.parse(readFileSync(process.env.ACCOUNT_SECURITY_FIXTURE,"utf8")),[A,B]=f.agencies;
let db,auth,closeAuthDatabase;
const newAccount={username:"s14.browser."+randomBytes(5).toString("hex"),password:randomBytes(24).toString("hex")};newAccount.email=newAccount.username+"@example.invalid";
test.beforeAll(async()=>{const u=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL);expect(u.hostname).toBe("127.0.0.1");expect(u.pathname).toBe(f.database);db=new pg.Client({connectionString:u.href});await db.connect();const provider=await import("../../../lib/auth.js");auth=provider.createPortalAuth({allowAccountCreation:true,useNextCookies:false});closeAuthDatabase=provider.closeAuthDatabase;await auth.api.signUpEmail({body:{...newAccount,name:"Synthetic browser setup"}});});
test.afterAll(async()=>{await closeAuthDatabase?.();await db?.end();});
test.beforeEach(async({context})=>{await db.query('DELETE FROM "rateLimit"');await context.setExtraHTTPHeaders({origin:f.origin});await context.route('**/*',r=>new URL(r.request().url()).origin===f.origin?r.continue():r.abort('blockedbyclient'));});
async function login(page,key,{factor=true}={}){
 const a=f.accounts[key] || f.specialists[key];await page.goto("/login");await page.getByLabel("Username",{exact:true}).fill(a.username);await page.getByLabel("Password",{exact:true}).fill(a.password);await page.getByRole("button",{name:"Sign in to portal",exact:true}).click();
 if(a.totpURI){await page.waitForURL(url=>url.pathname==="/account/mfa");if(!factor)return;await page.getByLabel("Authenticator code",{exact:true}).fill(await otp(a.totpURI));await page.getByRole("button",{name:"Verify",exact:true}).click();await page.waitForURL(url=>url.pathname==="/account/security");}
 else await page.waitForURL(url=>url.pathname==="/");
}
test("privileged browser sign-in withholds access until MFA; foreign agency still denies",async({page,context})=>{
 await login(page,"ownerA",{factor:false});
 expect((await context.request.get("/api/admin/agency?agency="+A.slug)).status()).toBe(401);
 await page.getByLabel("Authenticator code",{exact:true}).fill("wrong");await page.getByRole("button",{name:"Verify",exact:true}).click();await expect(page.locator("p[role=alert]")).toContainText("verification failed");
 await page.getByLabel("Authenticator code",{exact:true}).fill(await otp(f.accounts.ownerA.totpURI));await page.getByRole("button",{name:"Verify",exact:true}).click();await page.waitForURL(url=>url.pathname==="/account/security");
 await expect(page.getByText("MFA is required for your privileged roles.",{exact:false})).toBeVisible();
 expect((await context.request.get("/api/admin/agency?agency="+A.slug)).status()).toBe(200);expect((await context.request.get("/api/admin/agency?agency="+B.slug)).status()).toBe(403);
 const response=await context.request.get("/api/account/security");expect(response.headers()["cache-control"]).toContain("no-store");expect((await response.json()).assured).toBe(true);
 const cookie=(await context.cookies()).find(c=>c.name.endsWith("session_token"));expect(cookie.httpOnly).toBe(true);expect(cookie.sameSite).toBe("Lax");
});
test("captured invitation fragment is removed; wrong account cannot consume it; recipient accepts once",async({page,context})=>{
 await login(page,"ownerA");const current=await(await context.request.get("/api/admin/agency?agency="+A.slug)).json();const id=randomUUID();
 const created=await context.request.post("/api/admin/agency?agency="+A.slug,{data:{action:"invite.create",account:f.accounts.platformOnly.accountIdentifier,role:"staff",revision:current.revision,operation:id,reason:"Browser secure invite"}});expect(created.status()).toBe(200);expect((await created.json()).mailCaptured).toBe(true);
 const message=await mailFor(f.accounts.platformOnly.email,"invitation");expect(new URL(message.link).search).toBe("");
 await page.goto(message.link);await expect(page.getByRole("button",{name:"Accept invitation",exact:true})).toBeVisible();expect(new URL(page.url()).hash).toBe("");await page.getByRole("button",{name:"Accept invitation",exact:true}).click();await expect(page.locator("p[role=alert]")).toContainText("Invitation unavailable");
 expect((await db.query("SELECT used_at FROM agency_platform.invitation_links WHERE invitation_id=$1",[id])).rows[0].used_at).toBeNull();
 await context.clearCookies();await login(page,"platformOnly");await page.goto(message.link);await page.getByRole("button",{name:"Accept invitation",exact:true}).click();await expect(page.getByRole("status")).toContainText("Invitation accepted");
 await page.goto(message.link);await page.getByRole("button",{name:"Accept invitation",exact:true}).click();await expect(page.locator("p[role=alert]")).toContainText("Invitation unavailable");
});
test("browser password recovery uses private capture, preserves memberships and rejects replay",async({page,context})=>{
 const a=f.accounts.staffA,before=(await db.query("SELECT agency_id::text,role,is_active FROM agency_platform.memberships WHERE user_id=$1 ORDER BY agency_id",[a.id])).rows;
 await page.goto("/account/recovery");await page.getByLabel("Account email",{exact:true}).fill(a.email);await page.getByRole("button",{name:"Request instructions",exact:true}).click();await expect(page.getByRole("status")).toContainText("If eligible");
 const message=await mailFor(a.email,"reset"),password=randomBytes(24).toString("hex");await page.goto(message.link);await expect(page.getByLabel("New password",{exact:true})).toBeVisible();expect(new URL(page.url()).hash).toBe("");await page.getByLabel("New password",{exact:true}).fill(password);await page.getByRole("button",{name:"Reset password",exact:true}).click();await expect(page.getByRole("status")).toContainText("Password updated");
 await page.goto(message.link);await page.getByLabel("New password",{exact:true}).fill(password);await page.getByRole("button",{name:"Reset password",exact:true}).click();await expect(page.locator("p[role=alert]")).toContainText("unavailable or expired");
 expect((await db.query("SELECT agency_id::text,role,is_active FROM agency_platform.memberships WHERE user_id=$1 ORDER BY agency_id",[a.id])).rows).toEqual(before);
 a.password=password;await login(page,"staffA");expect((await context.request.get("/api/platform/agencies")).status()).toBe(403);
});
test("account session revocation signs out only other sessions; affected workspace checks stay fresh",async({page,context,browser})=>{
 await login(page,"ownerB");const other=await browser.newContext();try{
  const p=await other.newPage();await login(p,"ownerB");expect((await other.request.get("/api/admin/agency?agency="+B.slug)).status()).toBe(200);
  await page.getByRole("button",{name:"Sign out other sessions",exact:true}).click();await expect(page.getByRole("status")).toContainText("Other account sessions");
  expect((await other.request.get("/api/admin/agency?agency="+B.slug)).status()).toBe(401);expect((await context.request.get("/api/admin/agency?agency="+B.slug)).status()).toBe(200);
 } finally{await other.close();}
});
test("external routes remain closed and captured tokens are absent from storage and network URLs",async({page,context})=>{
 await page.goto("/account/recovery");const paths=[];page.on("request",r=>paths.push(r.url()));await page.getByLabel("Account email",{exact:true}).fill(f.accounts.clientA.email);await page.getByRole("button",{name:"Request instructions",exact:true}).click();await expect(page.getByRole("status")).toContainText("If eligible");
 const message=await mailFor(f.accounts.clientA.email,"reset"),token=new URLSearchParams(new URL(message.link).hash.slice(1)).get("token");await page.goto(message.link);await expect(page.getByLabel("New password",{exact:true})).toBeVisible();
 expect(paths.some(x=>x.includes(token))).toBe(false);const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));expect(storage).not.toContain(token);
 expect((await context.request.get("/agency")).status()).toBe(404);expect((await context.request.get("/api/auth/verify-email?token=synthetic" )).status()).toBe(404);
});

test("email verification and authenticator enrollment work through the UI; a recovery code handles a lost device",async({page,context})=>{
 await page.goto("/account/recovery");await page.getByLabel("Account email",{exact:true}).fill(newAccount.email);await page.getByRole("combobox").selectOption("verification");await page.getByRole("button",{name:"Request instructions",exact:true}).click();await expect(page.getByRole("status")).toContainText("If eligible");
 const message=await mailFor(newAccount.email,"verify");await page.goto(message.link);await page.getByRole("button",{name:"Verify email",exact:true}).click();await expect(page.getByRole("status")).toContainText("Email verified");
 await page.goto("/login");await page.getByLabel("Username",{exact:true}).fill(newAccount.username);await page.getByLabel("Password",{exact:true}).fill(newAccount.password);await page.getByRole("button",{name:"Sign in to portal",exact:true}).click();await page.waitForURL(url=>url.pathname==="/");
 await page.goto("/account/security");await page.getByLabel("Current password",{exact:true}).fill(newAccount.password);await page.getByRole("button",{name:"Set up authenticator",exact:true}).click();
 await expect(page.locator("aside code")).toBeVisible();const uri=await page.locator("aside code").textContent(),code=(await page.locator("aside pre").textContent()).split("\n")[0];
 await page.getByLabel("Authenticator code",{exact:true}).fill(await otp(uri));await page.getByRole("button",{name:"Verify authenticator",exact:true}).click();await expect(page.getByRole("status")).toContainText("Second factor verified");
 await page.getByRole("button",{name:"Hide setup details",exact:true}).click();await expect(page.locator("aside code")).toHaveCount(0);
 await context.request.post("/api/auth/sign-out",{data:{}});await page.goto("/login");await page.getByLabel("Username",{exact:true}).fill(newAccount.username);await page.getByLabel("Password",{exact:true}).fill(newAccount.password);await page.getByRole("button",{name:"Sign in to portal",exact:true}).click();await page.waitForURL(url=>url.pathname==="/account/mfa");
 await page.getByRole("button",{name:"Use a recovery code",exact:true}).click();await page.getByLabel("Recovery code",{exact:true}).fill(code);await page.getByRole("button",{name:"Verify",exact:true}).click();await page.waitForURL(url=>url.pathname==="/account/security");expect((await(await context.request.get("/api/account/security")).json()).assured).toBe(true);
 expect((await context.request.get("/api/platform/agencies")).status()).toBe(403);
});

test("account switching conceals and discards the previous account's displayed recovery codes",async({page,context,browser})=>{
 await login(page,"ownerA");await page.getByLabel("Current password for new recovery codes",{exact:true}).fill(f.accounts.ownerA.password);await page.getByRole("button",{name:"Replace recovery codes",exact:true}).click();await expect(page.locator("aside pre")).toBeVisible();
 const other=await browser.newContext({extraHTTPHeaders:{origin:f.origin}});
 try{
  const p=await other.newPage();await login(p,"ownerB");
  await page.evaluate(()=>window.dispatchEvent(new Event("blur")));await expect(page.locator("aside pre")).toHaveCount(0);
  await context.clearCookies();await context.addCookies(await other.cookies());await page.evaluate(()=>window.dispatchEvent(new Event("focus")));
  await expect(page.getByText(f.accounts.ownerB.email,{exact:true})).toBeVisible();await expect(page.getByText(f.accounts.ownerA.email,{exact:true})).toHaveCount(0);await expect(page.locator("aside pre")).toHaveCount(0);
  expect((await context.request.get("/api/admin/agency?agency="+A.slug)).status()).toBe(403);expect((await context.request.get("/api/admin/agency?agency="+B.slug)).status()).toBe(200);
 }finally{await other.close();}
});

test("agency staff review the intended recipient/client before approving a Members & Access request",async({page,context})=>{
 const id=randomUUID(),requester=f.accounts.clientA,recipient=f.specialists.whitecapManager;
 await db.query("SELECT agency_platform.request_client_invitation($1,$2,$3,$4,'member',$5)",[requester.accountIdentifier,requester.session,f.clients[0].id,recipient.email,id]);
 await login(page,"ownerA");await page.goto("/admin/agency/staff?agency="+A.slug);
 const invitation=page.locator(`[data-invitation-id="${id}"]`);await expect(invitation).toContainText(recipient.email);await expect(invitation).toContainText(f.clients[0].name);
 expect((await db.query("SELECT count(*)::int n FROM agency_platform.memberships WHERE agency_id=$1 AND user_id=$2 AND is_active",[A.id,recipient.id])).rows[0].n).toBe(0);
 page.once("dialog",d=>d.accept());await invitation.getByRole("button",{name:"Approve invitation",exact:true}).click();await expect(page.getByRole("status")).toContainText("saved and audited");
 const message=await mailFor(recipient.email,"invitation");expect(new URLSearchParams(new URL(message.link).hash.slice(1)).get("id")).toBe(id);
 expect((await db.query("SELECT count(*)::int n FROM agency_platform.memberships WHERE agency_id=$1 AND user_id=$2 AND is_active",[A.id,recipient.id])).rows[0].n).toBe(0);
 await context.clearCookies();await login(page,"whitecapManager");await page.goto(message.link);await page.getByRole("button",{name:"Accept invitation",exact:true}).click();await expect(page.getByRole("status")).toContainText("Invitation accepted");
 expect((await context.request.get("/api/admin/agency?agency="+A.slug)).status()).toBe(403);expect((await context.request.get("/api/platform/agencies")).status()).toBe(403);
});
