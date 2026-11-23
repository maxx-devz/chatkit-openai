import {test,expect} from "@playwright/test";
import {readFileSync} from "node:fs";
import {randomUUID} from "node:crypto";
import pg from "pg";
const f=JSON.parse(readFileSync(process.env.DELIVERY_ONBOARDING_FIXTURE,"utf8"));let db;
test.beforeAll(async()=>{const u=new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL);expect(u.hostname).toBe("127.0.0.1");expect(u.pathname).toBe(f.database);db=new pg.Client({connectionString:u.href});await db.connect();});
test.afterAll(async()=>{await db?.end();});
test.beforeEach(async({context})=>{await context.route("**/*",route=>new URL(route.request().url()).origin===f.origin?route.continue():route.abort("blockedbyclient"));});
async function identity(context,key){await context.clearCookies();await context.addCookies(f.accounts[key].cookie.split("; ").map(x=>{const n=x.indexOf("=");return {name:x.slice(0,n),value:x.slice(n+1),url:f.origin,httpOnly:true,sameSite:"Lax"};}));}
test("agency owner edits a fictional starter, approves its revision and assigns existing staff without Hubstaff",async({page,context})=>{
 await identity(context,"ownerA");await page.goto("/admin/agency/onboarding?agency="+f.agencies[0].slug);await expect(page.getByRole("heading",{name:"Prepare a role profile",exact:true})).toBeVisible();
 await page.getByLabel("Profile name",{exact:true}).fill("Browser delivery profile");await page.getByLabel("Reason for profile change",{exact:true}).fill("Synthetic reviewable role guidance");await page.getByRole("button",{name:"Save profile draft",exact:true}).click();await expect(page.getByRole("status")).toContainText("saved and audited");
 page.once("dialog",d=>d.accept("Synthetic exact revision approval"));await page.getByRole("button",{name:"Approve Browser delivery profile",exact:true}).click();await expect(page.getByText("Draft revision 1 · Approved revision 1",{exact:true})).toBeVisible();
 const profile=(await db.query("SELECT id FROM agency_platform.delivery_profiles WHERE agency_id=$1 AND fields->>'name'='Browser delivery profile'",[f.agencies[0].id])).rows[0];
 await page.getByLabel("Approved profile",{exact:true}).selectOption(profile.id);await page.getByLabel("Participant",{exact:true}).selectOption(f.accounts.staffA.id);await page.getByLabel("Client",{exact:true}).selectOption(f.clients[0].id);await page.getByLabel("Review owner",{exact:true}).selectOption(f.accounts.ownerA.id);
 await page.getByLabel("Expires at",{exact:true}).fill(new Date(Date.now()+86400000).toISOString().slice(0,16));await page.getByLabel("Assignment reason",{exact:true}).fill("Synthetic no-Hubstaff onboarding approval");await page.getByRole("button",{name:"Assign onboarding",exact:true}).click();await expect(page.getByRole("status")).toContainText("saved and audited");
 expect((await db.query("SELECT count(*)::int n FROM agency_platform.delivery_onboarding WHERE profile_id=$1",[profile.id])).rows[0].n).toBe(1);
});
test("staff checklist saves a blocker and resumes after reload without provider traffic",async({page,context})=>{
 await identity(context,"staffA");const traffic=[];page.on("request",r=>{if(/hubstaff|chatkit|google/i.test(new URL(r.url()).pathname))traffic.push(r.url());});await page.goto("/onboarding?run="+f.runs[0]);
 await expect(page.getByRole("heading",{name:"Harbor development onboarding",exact:true})).toBeVisible();
 await page.getByLabel("Status: Review agency standards",{exact:true}).selectOption("blocked");await page.getByLabel("Delivery note: Review agency standards",{exact:true}).fill("Waiting for the approved agency checklist");await page.getByRole("button",{name:"Save Review agency standards",exact:true}).click();await expect(page.getByRole("status")).toContainText("progress saved");
 await page.reload();await expect(page.getByLabel("Status: Review agency standards",{exact:true})).toHaveValue("blocked");await expect(page.getByLabel("Delivery note: Review agency standards",{exact:true})).toHaveValue("Waiting for the approved agency checklist");expect(traffic).toEqual([]);expect(await page.textContent("body")).not.toContain(f.hrCanary);
});
test("client, unrelated engagement and foreign agency users cannot open another checklist or administer profiles",async({page,context})=>{
 for(const key of ["clientA","engagementOnly","staffB"]){await identity(context,key);await page.goto("/onboarding?run="+f.runs[0]);await expect(page.getByRole("heading",{name:"Active delivery onboarding required",exact:true})).toBeVisible();expect((await context.request.get("/api/onboarding?run="+f.runs[0])).status()).toBe(403);expect((await context.request.get("/api/admin/agency/onboarding?agency="+f.agencies[0].slug)).status()).toBe(403);expect(await page.textContent("body")).not.toContain("Harbor development onboarding");}
});
test("specialist onboarding remains pinned to approved guidance and excludes HR data",async({page,context})=>{
 await identity(context,"specialist");await page.goto("/onboarding?run="+f.specialistRun);await expect(page.getByRole("heading",{name:"Updated draft, not published",exact:true})).toBeVisible();expect(await page.textContent("body")).not.toContain(f.hrCanary);expect((await context.request.get("/api/admin/agency/onboarding?agency="+f.agencies[0].slug)).status()).toBe(403);
 await page.getByLabel("Status: Prepare a small first task for review",{exact:true}).selectOption("in_progress");await page.getByRole("button",{name:"Save Prepare a small first task for review",exact:true}).click();await expect(page.getByRole("status")).toContainText("progress saved");
});
test("revoked scope clears an already open checklist and prevents stale writes",async({page,context})=>{
 await identity(context,"staffA");await page.goto("/onboarding?run="+f.runs[0]);await expect(page.getByRole("heading",{name:"Harbor development onboarding",exact:true})).toBeVisible();
 try{await db.query("UPDATE agency_platform.client_access SET is_active=false WHERE agency_id=$1 AND client_id=$2 AND user_id=$3",[f.agencies[0].id,f.clients[0].id,f.accounts.staffA.id]);expect((await context.request.get("/api/onboarding?run="+f.runs[0])).status()).toBe(403);await page.evaluate(()=>window.dispatchEvent(new Event("focus")));await expect(page.getByRole("heading",{name:"Harbor development onboarding",exact:true})).toHaveCount(0);}
 finally{await db.query("UPDATE agency_platform.client_access SET is_active=true WHERE agency_id=$1 AND client_id=$2 AND user_id=$3",[f.agencies[0].id,f.clients[0].id,f.accounts.staffA.id]);}
});
test("authorized multi-agency switching uses explicit independent onboarding scopes",async({page,context})=>{
 const ids=[];for(const i of [0,1]){const owner=f.accounts[i?"ownerB":"ownerA"],operation=randomUUID();const result=await db.query("SELECT agency_platform.onboarding_admin_change($1,$2,$3,$4::jsonb) data",[owner.accountIdentifier,owner.session,f.agencies[i].id,JSON.stringify({action:"run.assign",operation,reason:"Synthetic multi-agency authorized onboarding",profileId:f.profiles[i],profileRevision:i?"1":"2",clientId:f.clients[i?2:0].id,userId:f.accounts.multi.id,assignmentId:null,reviewOwner:owner.id,expiresAt:new Date(Date.now()+86400000).toISOString()})]);ids.push(result.rows[0].data.id);}
 await identity(context,"multi");await page.goto("/onboarding");for(const id of ids)await expect(page.locator('a[href="/onboarding?run='+id+'"]')).toBeVisible();
 await page.goto("/onboarding?run="+ids[0]);expect(await page.textContent("body")).not.toContain("B16A_SECRET_PROFILE");await page.goto("/onboarding?run="+ids[1]);await expect(page.getByRole("heading",{name:"B16A_SECRET_PROFILE",exact:true})).toBeVisible();
});
test("mobile onboarding is readable and private responses reject cross-site mutation",async({page,context})=>{
 await identity(context,"staffA");await page.setViewportSize({width:390,height:844});await page.goto("/onboarding?run="+f.runs[0]);await expect(page.getByRole("heading",{name:"Your first-work checklist",exact:true})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.screenshot({path:test.info().outputPath("mobile-onboarding.png"),fullPage:true});
 const own=await context.request.get("/api/onboarding?run="+f.runs[0]);expect(own.headers()["cache-control"]).toContain("no-store");expect((await context.request.post("/api/onboarding",{headers:{origin:"https://foreign.example"},data:{}})).status()).toBe(403);expect((await context.request.get("/agency")).status()).toBe(404);
});

test("read-only specialist assignments display read-only checklist controls",async({page,context})=>{
 await identity(context,"specialist");
 try{await db.query("UPDATE agency_platform.specialist_assignments SET actions=ARRAY['delivery.read'] WHERE id=$1",[f.assignments[0]]);await page.goto("/onboarding?run="+f.specialistRun);await expect(page.getByText(/Read-only onboarding/)).toBeVisible();await expect(page.getByRole("button",{name:"Save Review approved business knowledge",exact:true})).toBeDisabled();await expect(page.getByLabel("Status: Review approved business knowledge",{exact:true})).toBeDisabled();}
 finally{await db.query("UPDATE agency_platform.specialist_assignments SET actions=ARRAY['delivery.read','delivery.notes.write'] WHERE id=$1",[f.assignments[0]]);}
});
