import test from "node:test";
import assert from "node:assert/strict";
import {previewCreditPricing,validateCreditPricing,validateCreditAdjustment} from "../lib/credits-pricing.js";

test("Percentage and period-fixed formulas use exact decimal arithmetic",()=>{
  assert.deepEqual(previewCreditPricing({pricingType:"percentage",aocFee:"20",creditsPerUsd:"1000"},"0.3"),
    {apiCostUsd:"0.3",aocFeeUsd:"0.06",totalClientCostUsd:"0.36",creditsUsed:"360"});
  assert.deepEqual(previewCreditPricing({pricingType:"fixed",aocFee:"2.50",creditsPerUsd:"1000"},"0.1"),
    {apiCostUsd:"0.1",aocFeeUsd:"2.5",totalClientCostUsd:"2.6",creditsUsed:"2600"});
  assert.equal(previewCreditPricing({pricingType:"percentage",aocFee:"0",creditsPerUsd:"3"},"0.000000000001").creditsUsed,"0.000000000003");
});
test("Pricing rejects negative, nonfinite, exponential, overprecise and unreasonable values",()=>{
  for(const input of [
    {pricingType:"invoice",aocFee:"1",creditsPerUsd:"1"},
    {pricingType:"percentage",aocFee:"1001",creditsPerUsd:"1"},
    {pricingType:"fixed",aocFee:"-1",creditsPerUsd:"1"},
    {pricingType:"fixed",aocFee:"1",creditsPerUsd:"0"},
    {pricingType:"fixed",aocFee:"NaN",creditsPerUsd:"1"},
    {pricingType:"fixed",aocFee:"1e3",creditsPerUsd:"1"},
    {pricingType:"fixed",aocFee:"0.1234567890123",creditsPerUsd:"1"},
  ])assert.throws(()=>validateCreditPricing(input),TypeError);
});
test("Manual allocation validates scope, precision and stable retry keys",()=>{
  const good={clientId:"4",amount:"123.4500",idempotencyKey:"11111111-1111-4111-8111-111111111111"};
  assert.equal(validateCreditAdjustment(good).amount,"123.45");
  for(const patch of [{clientId:"1 OR TRUE"},{amount:"0"},{amount:"1000000001"},{idempotencyKey:"not-a-key"}])
    assert.throws(()=>validateCreditAdjustment({...good,...patch}),TypeError);
});
