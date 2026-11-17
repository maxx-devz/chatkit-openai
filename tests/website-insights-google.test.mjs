import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomBytes, randomUUID, createHash } from "node:crypto";
import { InsightError, SEARCH_SCOPE, propertyCoversWebsite } from "../lib/website-insights/policy.js";
import { googleConnectionView } from "../lib/website-insights/presentation.js";

async function integration({ scope = SEARCH_SCOPE, saved = null, properties = [], responseStatus = 200, responseError = {}, refreshError = false, exchangeError = false } = {}) {
  const key = `wi_google_${randomUUID()}`, calls = [], pending = new Map();
  const config = { origin: "https://portal.example", clientId: "test-client", clientSecret: "test-only", secret: "test-only-key" };
  const context = { client: { id: "1" }, user: { id: "2" }, session: { session: { id: "session-one" } } };
  let connection = saved ? { oauth_client_id: config.clientId, connected_at: "2026-10-30T01:00:00Z", property: null,
    encrypted_refresh_token: JSON.stringify({ value: "earlier-test-refresh", purpose: "website-insights:1:website-one:test-client" }), ...saved } : null;
  const sealDriveValue = (value, purpose) => JSON.stringify({ value, purpose });
  const mocks = {
    randomBytes, createHash, InsightError, SEARCH_SCOPE, propertyCoversWebsite,
    googleConfig: () => config,
    getWebsite: async () => ({ url: "https://example.com/" }),
    sealDriveValue,
    unsealDriveValue: (value, purpose) => { const sealed = JSON.parse(value); assert.equal(sealed.purpose, purpose); return sealed.value; },
    boundedJson: response => response.json(), readSearchData: () => ({}),
    fetch: async url => { calls.push({ fetch: url }); return new Response(JSON.stringify(responseStatus === 200 ? { siteEntry: properties } : { error: responseError }), { status: responseStatus }); },
    OAuth2Client: class {
      generateAuthUrl(options) { calls.push({ consent: options }); return "https://accounts.google.com/test-only"; }
      async getToken(options) { if (exchangeError) throw new Error("synthetic exchange failure"); calls.push({ exchange: options }); return { tokens: { refresh_token: "test-only-refresh", scope } }; }
      setCredentials() {}
      async getAccessToken() { if (refreshError) throw new Error("synthetic refresh failure"); return { token: "test-only-access" }; }
    },
    db: { query: async (sql, values = []) => {
      calls.push({ sql, values });
      if (sql.startsWith("SELECT") && sql.includes("FROM portal_website_insights_google")) return { rows: connection ? [connection] : [] };
      if (sql.startsWith("SELECT 1 FROM portal_website_insights_oauth_states")) return { rows: [...pending.values()].some(row => row[1] === values[0] && row[2] === values[1] && row[3] === values[2] && row[4] === values[3]) ? [{ present: 1 }] : [] };
      if (sql.startsWith("INSERT INTO portal_website_insights_google")) connection = { oauth_client_id: values[3], encrypted_refresh_token: values[4], property: null, connected_at: "2026-10-30T02:00:00Z" };
      if (sql.startsWith("INSERT INTO portal_website_insights_oauth_states")) pending.set(values[0], values);
      if (sql.startsWith("DELETE FROM portal_website_insights_oauth_states WHERE state_hash")) {
        const row = pending.get(values[0]);
        if (!row || row[2] !== values[1] || row[3] !== values[2] || row[4] !== values[3]) return { rows: [] };
        pending.delete(values[0]); return { rows: [{ website_id: row[1], encrypted_verifier: row[5] }] };
      }
      return { rows: [] };
    } },
  };
  globalThis[key] = mocks;
  try {
    const source = await readFile(new URL("../lib/website-insights/google.js", import.meta.url), "utf8");
    const code = `const {${Object.keys(mocks).join(",")}}=globalThis[${JSON.stringify(key)}];\n` + source.replace(/^import .*;\r?\n/gm, "");
    return { google: await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`), calls, context };
  } finally { delete globalThis[key]; }
}
test("Search Console consent requests only read access with a bound PKCE challenge", async () => {
  const { google, context, calls } = await integration();
  const start = await google.beginGoogle(context, "website-one");
  const options = calls.find(call => call.consent).consent;
  assert.deepEqual(options.scope, [SEARCH_SCOPE]); assert.equal(options.include_granted_scopes, false);
  assert.equal(options.code_challenge_method, "S256"); assert.equal(start.state.length, 43);
  await google.finishGoogle(context, start.state, start.state, "test-code");
  const verifier = calls.find(call => call.exchange).exchange.codeVerifier;
  assert.equal(createHash("sha256").update(verifier).digest("base64url"), options.code_challenge);
  const saved = calls.find(call => call.sql?.startsWith("INSERT INTO portal_website_insights_google"));
  assert.equal(saved.values[1], context.client.id);
  assert.equal(JSON.parse(saved.values[4]).purpose, "website-insights:1:website-one:test-client");
  await assert.rejects(google.finishGoogle(context, start.state, start.state, "replay"), error => error.code === "oauth_state");
});
test("OAuth state rejects another cookie, account or browser login session before token exchange", async () => {
  const { google, context, calls } = await integration();
  const start = await google.beginGoogle(context, "website-one");
  await assert.rejects(google.finishGoogle(context, start.state, "wrong-cookie", "code"), error => error.status === 403);
  for (const other of [
    { ...context, client: { id: "other-client" } },
    { ...context, user: { id: "other-user" } },
    { ...context, session: { session: { id: "other-session" } } },
  ]) await assert.rejects(google.finishGoogle(other, start.state, start.state, "code"), error => error.code === "oauth_state");
  assert.equal(calls.some(call => call.exchange), false);
});
test("missing granted Search Console scope does not save a Google connection", async () => {
  const { google, context, calls } = await integration({ scope: "https://www.googleapis.com/auth/drive.readonly" });
  const start = await google.beginGoogle(context, "website-one");
  await assert.rejects(google.finishGoogle(context, start.state, start.state, "code"), error => error.code === "oauth_scope");
  assert.equal(calls.some(call => call.sql?.startsWith("INSERT INTO portal_website_insights_google")), false);
});
test("disconnect deletes only this client's website connection without revoking shared Google grants", async () => {
  const { google, context, calls } = await integration();
  await google.disconnectGoogle(context, "website-one");
  assert.equal(calls.length, 2);
  assert.ok(calls.every(call => call.sql.includes("website_id=$1 AND client_id=$2")));
  assert.ok(calls.every(call => call.values[0] === "website-one" && call.values[1] === "1"));
});

test("no saved authorization is disconnected, without making a Google request", async () => {
  const {google,context,calls}=await integration();
  const status=await google.googleStatus(context,"website-one");
  assert.equal(status.connected,false);assert.equal(status.hasAuthorization,false);assert.equal(status.state,"not_connected");
  assert.equal(calls.some(call=>call.fetch),false);
});
test("stored tokens do not count as connected when Search Console API is disabled", async () => {
  const {google,context}=await integration({saved:{},responseStatus:403,responseError:{message:"private provider details",details:[{reason:"SERVICE_DISABLED"}]}});
  const status=await google.googleStatus(context,"website-one");
  assert.equal(status.connected,false);assert.equal(status.accessVerified,false);assert.equal(status.hasAuthorization,true);
  assert.equal(status.state,"api_disabled");assert.ok(!JSON.stringify(status).includes("private provider details"));
  const view=googleConnectionView(status);
  assert.equal(view.ready,false);assert.equal(view.label,"Search Console API not enabled");
});
test("an expired authorization is preserved but never labeled connected",async()=>{
  const {google,context}=await integration({saved:{},refreshError:true});
  const status=await google.googleStatus(context,"website-one");
  assert.equal(status.connected,false);assert.equal(status.hasAuthorization,true);assert.equal(status.state,"google_reconnect");
});
test("valid authorization without a matching website property is not a ready connection",async()=>{
  const {google,context}=await integration({saved:{},properties:[{siteUrl:"https://unrelated.example/",permissionLevel:"siteOwner"}]});
  const status=await google.googleStatus(context,"website-one");
  assert.equal(status.accessVerified,true);assert.equal(status.connected,false);assert.equal(status.state,"no_matching_property");
  assert.ok(!JSON.stringify(status).includes("unrelated.example"));
});
test("verified property discovery requires selection before declaring connected",async()=>{
  const properties=[{siteUrl:"https://example.com/",permissionLevel:"siteRestrictedUser"}];
  const unselected=await integration({saved:{},properties});
  const before=await unselected.google.googleStatus(unselected.context,"website-one");
  assert.equal(before.state,"property_required");assert.equal(before.connected,false);
  assert.equal(googleConnectionView(before).canSelectProperty,true);
  const selected=await integration({saved:{property:"https://example.com/"},properties});
  const after=await selected.google.googleStatus(selected.context,"website-one");
  assert.equal(after.state,"ready");assert.equal(after.connected,true);assert.equal(googleConnectionView(after).ready,true);
});
test("an unfinished account switch cannot reuse the old saved token as OAuth success",async()=>{
  const {google,context,calls}=await integration({saved:{property:"https://example.com/"},properties:[{siteUrl:"https://example.com/",permissionLevel:"siteOwner"}]});
  await google.beginGoogle(context,"website-one");
  const status=await google.googleStatus(context,"website-one");
  assert.equal(status.state,"sign_in_incomplete");assert.equal(status.connected,false);assert.equal(status.hasAuthorization,true);
  assert.equal(calls.some(call=>call.fetch),false);
  assert.equal(googleConnectionView(status).canSelectProperty,false);
});
test("pending sign-in is scoped to the requesting browser login",async()=>{
  const {google,context}=await integration({saved:{property:"https://example.com/"},properties:[{siteUrl:"https://example.com/",permissionLevel:"siteOwner"}]});
  await google.beginGoogle(context,"website-one");
  const other={...context,session:{session:{id:"other-browser-login"}}};
  assert.equal((await google.googleStatus(other,"website-one")).state,"ready");
  assert.equal((await google.googleStatus(context,"website-one")).state,"sign_in_incomplete");
});
test("cancelled or failed replacement authorization preserves the earlier connection",async()=>{
  const {google,context,calls}=await integration({saved:{},exchangeError:true});
  let start=await google.beginGoogle(context,"website-one");
  await assert.rejects(google.finishGoogle(context,start.state,start.state,"code"),/exchange failure/);
  assert.equal(calls.some(call=>call.sql?.startsWith("INSERT INTO portal_website_insights_google")),false);
  start=await google.beginGoogle(context,"website-one");
  assert.equal(await google.cancelGoogle(context,start.state,start.state),"website-one");
  const status=await google.googleStatus(context,"website-one");
  assert.equal(status.hasAuthorization,true);assert.notEqual(status.state,"sign_in_incomplete");
});
test("failure results and legacy connected booleans cannot claim a successful current connection",()=>{
  const ready={state:"ready",hasAuthorization:true,accessVerified:true,connected:true,property:"https://example.com/",properties:[{siteUrl:"https://example.com/"}]};
  for(const result of ["failed","cancelled"]){
    const view=googleConnectionView(ready,result);
    assert.equal(view.ready,false);assert.equal(view.canSelectProperty,false);assert.equal(view.label,"Latest Google sign-in did not complete");
  }
  assert.equal(googleConnectionView({connected:true}).ready,false);
  const pending=googleConnectionView({state:"sign_in_incomplete",hasAuthorization:false});
  assert.equal(pending.hasAuthorization,false);assert.equal(pending.ready,false);
});
