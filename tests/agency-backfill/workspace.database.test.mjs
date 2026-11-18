import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

// Use only an explicitly selected, disposable, migrated Stage 04 synthetic copy.
test("Stage 05 authenticated workspace boundaries", { skip: !process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL }, async t => {
  const owner = new URL(process.env.AGENCY_WORKSPACE_TEST_DATABASE_URL);
  const runtime = new URL(process.env.DATABASE_URL);
  assert.equal(owner.hostname,"127.0.0.1");
  assert.match(owner.pathname,/^\/aoc_stage04_rehearsal_[a-f0-9]+$/);
  assert.equal(runtime.host,owner.host);
  assert.equal(runtime.pathname,owner.pathname);
  assert.match(runtime.username,/^aoc_s04_legacy_[a-f0-9]+$/);
  const origin = process.env.BETTER_AUTH_URL;
  assert.equal(new URL(origin).hostname,"127.0.0.1");
  const admin = new pg.Client({ connectionString:owner.href });
  await admin.connect();
  const { createPortalAuth,closeAuthDatabase } = await import("../../lib/auth.js");
  try {
    const actual = (await admin.query("SELECT current_database() name,inet_server_port() port")).rows[0];
    assert.equal(actual.name,owner.pathname.slice(1)); assert.equal(actual.port,Number(owner.port));
    const sentinel = await admin.query("SELECT id FROM portal_users WHERE external_id IN ('fixture-mira','fixture-admin','fixture-other-admin')");
    assert.equal(sentinel.rowCount,3);
    const appRole = '"' + runtime.username + '"';
    await admin.query(await readFile(new URL("../../database/internal-user-schema.sql", import.meta.url),"utf8"));
    await admin.query("GRANT SELECT ON public.portal_internal_users TO "+appRole);
    // The disposable bootstrap created these Better Auth tables via its official migrator.
    const authTables = (await admin.query("SELECT quote_ident(tablename) name FROM pg_tables WHERE schemaname='public' AND tablename IN ('user','account','session','verification','rateLimit')")).rows;
    assert.ok(authTables.length>=4);
    for (const table of authTables) await admin.query("GRANT SELECT,INSERT,UPDATE,DELETE ON public."+table.name+" TO "+appRole);
    const provisioning = createPortalAuth({allowAccountCreation:true,useNextCookies:false});
    const users = new Map();
    for (const [id,name] of [[301,"mira"],[300,"operator"],[303,"support"]]) {
      const username = "stage05."+name;
      const password = randomBytes(24).toString("hex");
      const signed = await provisioning.api.signUpEmail({body:{username,name,email:username+"@example.invalid",password}});
      await admin.query("UPDATE portal_users SET external_id=$1 WHERE id=$2",[signed.user.id,id]);
      const login = await provisioning.api.signInUsername({body:{username,password},asResponse:true,
        headers:new Headers({origin})});
      assert.equal(login.status,200);
      const cookies=login.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
      assert.ok(cookies.includes("session_token"));
      users.set(id,{cookies,external:signed.user.id});
    }
    const portal = await import("../../lib/portal-data.js");
    const platform = await import("../../lib/admin-data.js");
    const {PUT} = await import("../../app/api/session/client/route.js");
    const aoc = (await admin.query("SELECT aoc_agency_id::text id FROM agency_platform.backfill_state")).rows[0].id;
    const harbor = (await admin.query("SELECT id::text FROM agency_platform.agencies WHERE slug='harbor-fixture'")).rows[0].id;
    function headers(id, cookie="") {
      return new Headers({host:new URL(origin).host,origin,"content-type":"application/json",cookie:users.get(id).cookies+(cookie?"; "+cookie:"")});
    }
    function selection(body,h=headers(301)) {
      return PUT(new Request(origin+"/api/session/client",{method:"PUT",headers:h,body:JSON.stringify(body)}));
    }
    const h=headers(301,"aoc_active_client=s04-orchid; aoc_active_agency=aoc");
    const denied=e=>e.publicDetails?.status===403;
    if (process.env.AGENCY_WORKSPACE_BROWSER_CHECK === "1") {
      await t.test("Chrome chooses a workspace and switches the current document", async () => {
        const { chromium, expect } = await import("@playwright/test");
        const browser = await chromium.launch({channel:"chrome", headless:true});
        try {
          const context = await browser.newContext({serviceWorkers:"block"});
          const cookie = users.get(301).cookies.split("; ").find(value => value.split("=")[0].endsWith("session_token"));
          const separator = cookie.indexOf("=");
          await context.addCookies([{name:cookie.slice(0,separator), value:cookie.slice(separator+1), url:origin, httpOnly:true}]);
          await context.route("**/*", route => {
            const url = new URL(route.request().url());
            if (url.origin !== origin) return route.abort();
            if (url.pathname === "/" || url.pathname === "/api/session/client" || url.pathname.startsWith("/_next/")) return route.continue();
            return route.fulfill({status:503,json:{error:"Outside the workspace chooser check"}});
          });
          const page = await context.newPage();
          await page.goto(origin+"/?workspaceClient=s04-orchid");
          await expect(page.getByRole("heading",{name:"Choose your workspace"})).toBeVisible();
          const orchid = page.getByRole("button",{name:/orchid/i});
          await orchid.click();
          const account = page.getByRole("combobox",{name:"Active client account"});
          await expect(account).toHaveValue("s04-orchid");
          const [switched] = await Promise.all([
            page.waitForResponse(r => r.url() === origin+"/api/session/client" && r.request().method() === "PUT"),
            account.selectOption("s04-birch"),
          ]);
          assert.equal(switched.status(),200);
          await expect(page.locator("header p strong").filter({hasText:/^Birch AOC$/})).toBeVisible();
          await page.reload();
          await expect(account).toHaveValue("s04-birch");
          const saved = (await context.cookies(origin)).filter(c => c.name.startsWith("aoc_active_"));
          assert.equal(saved.length,2);
          assert.ok(saved.every(c => c.httpOnly));
          assert.equal((await context.request.get(origin+"/agency")).status(),404);
          assert.equal((await context.request.get(origin+"/api/agency")).status(),404);
        } finally { await browser.close(); }
      });
    }
    await t.test("live multi-membership selection and request-supplied selectors",async()=>{
      assert.equal((await portal.listWorkspaceChoices(h)).length,2);
      await assert.rejects(portal.resolvePortalContext(headers(301)),e=>e.publicDetails?.status===409);
      const selected=await selection({slug:"s04-orchid",agencySlug:"aoc",role:"platform_admin"});
      assert.equal(selected.status,200);
      assert.equal(selected.headers.getSetCookie().length,2);
      assert.equal((await selection({slug:"s04-orchid",agencySlug:"harbor-fixture"})).status,403);
      const badOrigin=headers(301);badOrigin.set("origin","https://unknown.invalid");
      assert.equal((await selection({slug:"s04-orchid",agencySlug:"aoc"},badOrigin)).status,403);
      const saved=await portal.resolvePortalContext(h);assert.equal(saved.agency.id,aoc);
      assert.equal(saved.client.role,"client_admin");
      const hinted = headers(301);
      hinted.set("x-portal-client", "s04-orchid");
      await assert.rejects(portal.resolvePortalContext(hinted, { document:true }), e=>e.publicDetails?.status===409);
      assert.equal((await portal.resolvePortalContext(hinted)).client.id, "501");
      assert.equal((await portal.requireAgencyWorkspace(headers(300),"agency.workspace.read",{agencyId:aoc})).role,"agency_admin");
      await assert.rejects(portal.requireAgencyWorkspace(headers(300),"agency.workspace.read",{agencyId:harbor}),denied);
      await assert.rejects(portal.requireAgencyWorkspace(headers(301),"agency.workspace.read",{agencyId:aoc}),denied);
      const switched=await selection({slug:"s04-birch",agencySlug:"aoc"},h);
      const newCookie=switched.headers.getSetCookie().map(v=>v.split(";")[0]).join("; ");
      const next=await portal.resolvePortalContext(headers(301,newCookie));
      assert.equal(next.client.id,"502");assert.notEqual(next.workspaceKey,saved.workspaceKey);
      for(const [key,val] of [["host","unknown.invalid"],["x-agency-id",harbor],["x-client-id","601"]]) {
        const forged=new Headers(h);forged.set(key,val);await assert.rejects(portal.resolvePortalContext(forged),denied);
      }
      await assert.rejects(portal.requireClientPermission(h,"client.overview.read",{agencyId:aoc,clientId:"502"}),denied);
      const forged=new Headers(h);forged.set("x-role","aoc_admin");
      await assert.rejects(platform.resolvePlatformOperator(forged),denied);
      await assert.rejects(portal.requireAgencyWorkspace(h,"agency.workspace.read",{agencyId:aoc,clientId:"501"}),denied);
    });
    await t.test("same signed session observes role reductions, grant and agency suspension",async()=>{
      await admin.query("UPDATE agency_platform.client_access SET access_level='read' WHERE client_id=501 AND user_id=301");
      await assert.rejects(portal.requireClientPermission(h,"client.members.manage"),denied);
      assert.equal((await portal.resolvePortalContext(h)).client.role,"client_viewer");
      await admin.query("UPDATE portal_memberships SET is_active=false WHERE client_id=501 AND user_id=301");
      await assert.rejects(portal.resolvePortalContext(h),denied);
      await admin.query("UPDATE portal_memberships SET is_active=true WHERE client_id=501 AND user_id=301");
      await admin.query("UPDATE agency_platform.memberships SET is_active=false WHERE user_id=301 AND agency_id=$1",[aoc]);
      await assert.rejects(portal.resolvePortalContext(h),denied);
      await admin.query("UPDATE agency_platform.memberships SET is_active=true WHERE user_id=301 AND agency_id=$1",[aoc]);
      await admin.query("UPDATE agency_platform.agencies SET is_active=false WHERE id=$1",[aoc]);
      await assert.rejects(portal.resolvePortalContext(h),denied);
      await admin.query("UPDATE agency_platform.agencies SET is_active=true WHERE id=$1",[aoc]);
      await admin.query("INSERT INTO agency_platform.memberships(agency_id,user_id,role) VALUES($1,301,'staff')",[harbor]);
      await admin.query("INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level) VALUES($1,601,301,'read')",[harbor]);
      const foreign=headers(301,"aoc_active_agency=harbor-fixture; aoc_active_client=s04-pine");
      assert.equal((await portal.requireAgencyWorkspace(foreign,"agency.workspace.read",{agencyId:harbor,clientId:"601"})).role,"staff");
      await assert.rejects(portal.resolvePortalContext(foreign),e=>e.publicDetails?.code==="agency_client_gated");
      assert.equal((await platform.resolvePlatformOperator(headers(300))).admin.id,"300");
      await assert.rejects(platform.resolveAdminContext(headers(300)),denied);
    });
    await t.test("support consent, logged exercise, denial, expiry and revocation",async()=>{
      const grant=randomUUID(),expired=randomUUID(),resource={agencyId:aoc,clientId:"501"};
      async function approve(id, clientApprover, start, end) {
        return admin.query(`INSERT INTO agency_platform.support_grants
          (id,agency_id,client_id,actor_id,agency_approver,client_approver,reason,ticket,action,approved_at,expires_at)
          VALUES($1,$2,501,303,300,$3,'Review synthetic status','SYN-5','support.workspace.status.read',now()+$4::interval,now()+$5::interval)`,
          [id,aoc,clientApprover,start,end]);
      }
      await assert.rejects(approve(randomUUID(),303,"0 minutes","10 minutes"),{code:"23514"});
      const app = new pg.Client({connectionString:runtime.href});
      await app.connect();
      try {
        await assert.rejects(app.query("SELECT id FROM agency_platform.support_grants LIMIT 1"), {code:"42501"});
        await assert.rejects(app.query("INSERT INTO agency_platform.support_grants DEFAULT VALUES"), {code:"42501"});
      } finally { await app.end(); }
      await approve(grant,301,"0 minutes","10 minutes");
      assert.deepEqual(await portal.readSupportWorkspaceStatus(headers(303),grant,resource),{portalEnabled:true});
      await assert.rejects(portal.readSupportWorkspaceStatus(headers(300),grant,resource),denied);
      await assert.rejects(portal.readSupportWorkspaceStatus(headers(303),grant,{agencyId:harbor,clientId:"601"}),denied);
      await admin.query("UPDATE agency_platform.support_grants SET revoked_at=now() WHERE id=$1",[grant]);
      await assert.rejects(portal.readSupportWorkspaceStatus(headers(303),grant,resource),denied);
      await approve(expired,301,"-30 minutes","-1 minute");
      await assert.rejects(portal.readSupportWorkspaceStatus(headers(303),expired,resource),denied);
      const events=await admin.query("SELECT outcome FROM agency_platform.support_access_log WHERE grant_id=$1 ORDER BY id",[grant]);
      assert.deepEqual(events.rows.map(r=>r.outcome),["approval_recorded","exercised","denied","denied","revoked","denied"]);
    });
    await t.test("inactive Internal identities and revoked Better Auth sessions stay denied",async()=>{
      await admin.query("INSERT INTO portal_internal_users(user_id,hubstaff_user_id,is_active) VALUES(301,900001,false)");
      await assert.rejects(portal.resolvePortalContext(h),e=>e.publicDetails?.code==="internal_user_only");
      await admin.query("DELETE FROM portal_internal_users WHERE user_id=301");
      await admin.query('DELETE FROM public."session" WHERE "userId"=$1',[users.get(301).external]);
      await assert.rejects(portal.resolvePortalContext(h),e=>e.publicDetails?.status===401);
    });
  } finally {
    await closeAuthDatabase();
    await admin.end();
  }
});
