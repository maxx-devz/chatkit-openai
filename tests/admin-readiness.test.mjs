import test from "node:test";
import assert from "node:assert/strict";
import {pricingTimeline,creditAdjustmentReason,previewAllowanceAdjustment,activePricingChanged} from "../lib/admin-credit-pricing.js";
import {adminView,adminClientTab,legacyAdminHash} from "../lib/admin-navigation.js";
test("Current pricing is independent of scheduled edits and latest effective version wins",()=>{
  const versions=[{id:"3",effectivePeriod:"2026-12",aocFee:"25"},{id:"2",effectivePeriod:"2026-12",aocFee:"20"},{id:"1",effectivePeriod:"2026-11",aocFee:"40"}];
  const result=pricingTimeline(versions,"2026-11");assert.equal(result.current.aocFee,"40");assert.equal(result.scheduled.length,1);assert.equal(result.scheduled[0].aocFee,"25");
  assert.equal(pricingTimeline(versions,"2026-12").current.id,"3");
});
test("Allowance preview preserves exact decimals and never confirms missing costs",()=>{
  const report={allocatedCredits:"1100",creditsUsed:"5.613146",pricing:{},incomplete:true};
  assert.deepEqual(previewAllowanceAdjustment(report,"100"),{change:"100",allocatedAfter:"1200",availableAfter:null});
  assert.equal(previewAllowanceAdjustment({...report,incomplete:false},"-100").availableAfter,"994.386854");
  assert.equal(previewAllowanceAdjustment({...report,incomplete:false,partialHistory:true},"100").availableAfter,null);
  assert.equal(previewAllowanceAdjustment({...report,allocatedCredits:null,creditsUsed:null},"100").availableAfter,null);
});
test("Inactive fee drafts cannot trigger an unchanged scheduled pricing save",()=>{
  const baseline={pricingType:'percentage',percentageFee:'20',fixedFee:'',creditsPerUsd:'1000'};
  assert.equal(activePricingChanged({...baseline,fixedFee:'2.5',percentageFee:'20.00'},baseline),false);
  assert.equal(activePricingChanged({...baseline,pricingType:'fixed',fixedFee:'2.5'},baseline),true);
});
test("New audit reasons are bounded plain text; routing preserves existing anchor destinations",()=>{
  assert.equal(creditAdjustmentReason("  Approved  reporting adjustment  "),"Approved reporting adjustment");
  for(const reason of ["","<script>","x".repeat(301),"x\u0000y"])assert.throws(()=>creditAdjustmentReason(reason),TypeError);
  assert.equal(adminView("clients"),"clients");assert.equal(adminView("untrusted"),"overview");
  assert.equal(adminClientTab("integrations"),"integrations");assert.deepEqual(legacyAdminHash("#ai-controls"),{view:"clients",tab:"usage"});
});
