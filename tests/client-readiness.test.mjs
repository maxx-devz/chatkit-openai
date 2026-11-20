import test from "node:test";
import assert from "node:assert/strict";
import {balancePresentation,creditActivity,creditNumber,creditSnapshot} from "../lib/credits-presentation.js";
import {previewCreditPricing} from "../lib/credits-pricing.js";
import {auditActionLabel,orderedWorkflowColumns,workColumns} from "../lib/portal-presentation.js";
import {clientNavigation} from "../lib/client-navigation.js";
import {clientPermissionsForRole} from "../lib/client-permissions.js";

test("Balance states distinguish loading, zero, missing allowances, incomplete and unavailable data",()=>{
  assert.equal(balancePresentation(null).state,"loading");
  assert.equal(balancePresentation(null,"network error").state,"unavailable");
  const ready={ready:true,pricing:{},availableCredits:"0"};
  assert.equal(balancePresentation(ready).label,"0");assert.equal(balancePresentation(ready).state,"zero");
  assert.equal(balancePresentation({...ready,availableCredits:null}).label,"Not assigned");
  assert.equal(balancePresentation({...ready,incomplete:true,availableCredits:null}).label,"Not confirmed");
  assert.equal(balancePresentation({...ready,estimatedEvents:1}).detail.includes("estimated"),true);
  assert.notEqual(creditNumber("0.000000000001"),"0");
});
test("An unset allowance is not reported as an exhausted or uncertain balance",()=>{
  const report={ready:true,pricing:{pricingType:"fixed"},allocatedCredits:null,availableCredits:null,incomplete:true,partialHistory:true,creditsUsed:"200000",aiUsageCredits:"0",fixedFeeCredits:"200000"};
  assert.equal(balancePresentation(report).label,"Allowance not set");
  assert.equal(balancePresentation(report).state,"unassigned");
  assert.match(balancePresentation(report).detail,/Pricing does not assign credits/);
  assert.equal(balancePresentation({...report,allocatedCredits:"0"}).label,"Not confirmed");
});

test("Pricing examples come from the supplied historical version rather than current defaults",()=>{
  assert.equal(previewCreditPricing({pricingType:"percentage",aocFee:"40",creditsPerUsd:"1000"},"1").creditsUsed,"1400");
  assert.equal(previewCreditPricing({pricingType:"percentage",aocFee:"20",creditsPerUsd:"1000"},"1").creditsUsed,"1200");
});
test("Transaction snapshot validation accepts canonical past timestamps and rejects invalid/future input",()=>{
  const now=new Date("2026-11-17T01:00:00.000Z");
  assert.equal(creditSnapshot("",now),now.toISOString());
  assert.equal(creditSnapshot("2026-11-01T00:00:00.000Z",now),"2026-11-01T00:00:00.000Z");
  for(const value of ["invalid","2026-02-31T00:00:00.000Z","2026-12-01T00:00:00.000Z"])
    assert.throws(()=>creditSnapshot(value,now),TypeError);
});
test("Client descriptions do not claim failed or unpriced requests were free",()=>{
  assert.match(creditActivity({kind:"usage",status:"failed",credits:null}),/Unsuccessful.*cost details missing/);
  assert.equal(auditActionLabel("client.document.add"),"Reference added");
  assert.equal(auditActionLabel("unrecognized_internal_code"),"Other recorded activity");
});
test("Reference cards are excluded from active work and review columns appear first",()=>{
  const columns=[{name:"Notes",stage:"other"},{name:"Doing",stage:"in_progress"},{name:"Ideas",stage:"other"},{name:"Review",stage:"review"},{name:"Done",stage:"done"}];
  assert.deepEqual(workColumns(columns).map(c=>c.name),["Doing","Review"]);
  assert.deepEqual(orderedWorkflowColumns(columns).map(c=>c.name),["Review","Doing","Done","Notes","Ideas"]);
});
test("Viewer and Member navigation retains existing permission boundaries",()=>{
  const viewer=clientNavigation(clientPermissionsForRole("client_viewer"));
  const member=clientNavigation(clientPermissionsForRole("member"));
  assert.ok(viewer.some(c=>c.view==="documents"));
  assert.ok(!viewer.some(c=>["ai","members","audit"].includes(c.view)));
  assert.ok(member.some(c=>c.view==="ai"));
  assert.ok(!member.some(c=>["members","audit"].includes(c.view)));
});
