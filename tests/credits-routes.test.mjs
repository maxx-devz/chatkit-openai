import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {previewCreditPricing} from "../lib/credits-pricing.js";
import {validateCreditAdjustment} from "../lib/credits-pricing.js";
import {previewAllowanceAdjustment} from "../lib/admin-credit-pricing.js";

async function route(file,{authorized=true,origin=true,database={}}={}) {
  const calls=[],key=randomUUID();
  const mocks={withAdminAudit:(_operation,handler)=>handler,noteAdminAuditError:()=>{},noteAdminAuditOutcome:()=>{},
    databasePool:database,CreditsConflict:class extends Error {},
    requireClientPermission:async()=>{if(!authorized)throw {publicDetails:{status:403}};return {client:{id:"4"}};},
    resolveAdminContext:async()=>{if(!authorized)throw {publicDetails:{status:403}};return {admin:{id:"9"}};},
    portalErrorResponse:()=>Response.json({error:"Denied"},{status:403}),
    adminErrorResponse:()=>Response.json({error:"Denied"},{status:403}),
    assertTrustedOrigin:()=>{if(!origin)throw {security:true};},
    requestSecurityErrorResponse:e=>e.security?Response.json({error:"Untrusted origin"},{status:403}):null,
    readJsonRequest:r=>r.json(),previewCreditPricing,validateCreditAdjustment,previewAllowanceAdjustment,
    readAdminCreditReport:async(_db,id,period)=>{calls.push({kind:"report",id,period});return {ready:true,pricing:{},allocatedCredits:"1000",creditsUsed:"10",incomplete:true,availableCredits:null};},
    readClientPlan:async()=>({ready:true,configured:false}),
    readClientCredits:async(_db,id,options)=>{calls.push({kind:"read",id,options});return {ready:true,clientId:id,availableCredits:"5"};},
    readCreditPricingAdmin:async()=>{calls.push({kind:"settings"});return {mode:"reporting_only"};},
    saveCreditPricing:async(_db,input,actor)=>{calls.push({kind:"pricing",input,actor});return {id:"1"};},
    allocateReportingCredits:async(_db,input,actor)=>{calls.push({kind:"allocation",input,actor});return {recorded:true};},
  };
  globalThis[key]=mocks;
  try {
    const source=await readFile(new URL(file,import.meta.url),"utf8");
    const code=`const {${Object.keys(mocks).join(",")}}=globalThis[${JSON.stringify(key)}];\n`
      +source.replace(/^import .*;\r?\n/gm,"");
    return {module:await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64")),calls};
  }finally{delete globalThis[key];}
}
test("Client credits always use authenticated scope; supplied tenant IDs cannot widen it",async()=>{
  const f=await route("../app/api/credits/route.js");
  const response=await f.module.GET(new Request("https://portal.test/api/credits?clientId=999&summary=1",{headers:{"x-aoc-client":"4"}}));
  assert.equal(response.status,200);
  assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.equal(f.calls[0].id,"4");
  assert.equal(f.calls[0].options.summary,true);
  assert.equal((await f.module.GET(new Request("https://portal.test/api/credits",{headers:{"x-aoc-client":"999"}}))).status,409);
  assert.equal(f.calls.length,1);
});
test("Unauthorized clients cannot read credits; clients cannot read or change admin pricing",async()=>{
  for(const file of ["../app/api/credits/route.js","../app/api/admin/credits/route.js"]) {
    const f=await route(file,{authorized:false});
    assert.equal((await f.module.GET(new Request("https://portal.test/api/credits"))).status,403);
    assert.equal(f.calls.length,0);
  }
  for(const settings of [{authorized:false},{origin:false}]) {
    const f=await route("../app/api/admin/credits/route.js",settings);
    const response=await f.module.POST(new Request("https://portal.test/api/admin/credits",{
      method:"POST",body:JSON.stringify({action:"pricing",clientId:"999"}),
    }));
    assert.equal(response.status,403);assert.equal(f.calls.length,0);
  }
});
test("Admin preview makes no ledger write and pricing saves use the verified actor",async()=>{
  const f=await route("../app/api/admin/credits/route.js");
  const request=body=>new Request("https://portal.test/api/admin/credits",{method:"POST",body:JSON.stringify(body)});
  const response=await f.module.POST(request({action:"preview",pricingType:"percentage",aocFee:"20",creditsPerUsd:"1000",apiCostUsd:"1"}));
  assert.equal((await response.json()).creditsUsed,"1200");assert.equal(f.calls.length,0);
  await f.module.POST(request({action:"pricing",actorId:"evil"}));
  assert.equal(f.calls[0].actor,"9");
  assert.equal((await f.module.POST(request({action:"charge_customer"}))).status,400);
});
test("Admin client snapshots and allowance previews are read-only and remain behind admin authorization",async()=>{
  const f=await route("../app/api/admin/credits/route.js");
  assert.equal((await f.module.GET(new Request("https://portal.test/api/admin/credits?clientId=4&month=2026-11"))).status,200);
  assert.deepEqual(f.calls[0],{kind:"report",id:"4",period:"2026-11"});
  const preview=await f.module.POST(new Request("https://portal.test/api/admin/credits",{method:"POST",body:JSON.stringify({action:"adjustment_preview",clientId:"4",period:"2026-11",amount:"100",idempotencyKey:randomUUID()})}));
  assert.equal(preview.status,200);assert.equal((await preview.json()).availableAfter,null);
  assert.ok(f.calls.every(call=>call.kind==="report"));
  const denied=await route("../app/api/admin/credits/route.js",{authorized:false});
  assert.equal((await denied.module.GET(new Request("https://portal.test/api/admin/credits?clientId=4"))).status,403);assert.equal(denied.calls.length,0);
});
test("Client credits stay in the header; administrators have a direct pricing destination",async()=>{
  const source=await readFile(new URL("../components/credits/header-credits.js",import.meta.url),"utf8");
  for(const phrase of ["Credits Overview","Token Usage","Usage History","Credit Transactions","Pricing Details","aria-expanded","Escape","pointerdown","onBlur","onMouseEnter"])
    assert.ok(source.includes(phrase),phrase);
  const nav=await readFile(new URL("../lib/client-navigation.js",import.meta.url),"utf8");
  const sidebar=await readFile(new URL("../components/admin/admin-sidebar.js",import.meta.url),"utf8");
  assert.doesNotMatch(nav,/\/credits|AI Credits/);assert.match(sidebar,/\/admin\/credits/);
});

test("Website integration status requires admin access and reads only the selected existing client",async()=>{
  const queries=[],database={query:async(sql,values)=>{
    queries.push({sql,values});
    if(sql.startsWith("SELECT id FROM"))return {rows:values[0]==="4"?[{id:"4"}]:[]};
    if(sql.includes("to_regclass"))return {rows:[{ready:true}]};
    return {rows:[{name:"Selected client store",url:"https://example.com/"}]};
  }};
  const denied=await route("../app/api/admin/client-operations/route.js",{authorized:false,database});
  assert.equal((await denied.module.GET(new Request("https://portal.test/api/admin/client-operations?clientId=4"))).status,403);
  assert.equal(queries.length,0);
  const f=await route("../app/api/admin/client-operations/route.js",{database});
  assert.equal((await f.module.GET(new Request("https://portal.test/api/admin/client-operations?clientId=999"))).status,404);
  assert.equal(queries.length,1);queries.length=0;
  assert.equal((await f.module.GET(new Request("https://portal.test/api/admin/client-operations?clientId=0"))).status,400);
  assert.equal(queries.length,0);
  const response=await f.module.GET(new Request("https://portal.test/api/admin/client-operations?clientId=4"));
  assert.equal(response.status,200);assert.equal(response.headers.get("cache-control"),"private, no-store");
  assert.equal((await response.json()).clientId,"4");
  assert.deepEqual(queries.at(-1).values,["4"]);assert.match(queries.at(-1).sql,/client_id=\$1 AND archived_at IS NULL/);
  assert.ok(queries.every(query=>query.sql.startsWith("SELECT")));
});
