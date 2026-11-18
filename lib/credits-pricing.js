// Fixed-point decimals; monetary arithmetic never uses binary floating point.
const SCALE=10n**12n;
function units(value) {
  const text=String(value);
  if(!/^-?\d{1,18}(?:\.\d{1,12})?$/.test(text)) throw new TypeError("Use a decimal amount with at most 12 decimal places.");
  const negative=text.startsWith("-");
  const [whole,fraction=""]=text.replace(/^-/,"").split(".");
  return (BigInt(whole)*SCALE+BigInt(fraction.padEnd(12,"0")))*(negative?-1n:1n);
}
function decimal(value) {
  const sign=value<0n?"-":"",absolute=value<0n?-value:value;
  const fraction=(absolute%SCALE).toString().padStart(12,"0").replace(/0+$/,"");
  return sign+(absolute/SCALE).toString()+(fraction?"."+fraction:"");
}
export function normalizeCreditDecimal(value) {return decimal(units(value));}
export function validateCreditPricing(input) {
  if(!["fixed","percentage"].includes(input?.pricingType)) throw new TypeError("Choose Fixed Fee or Percentage Markup.");
  const fee=units(input.aocFee),rate=units(input.creditsPerUsd);
  if(fee<0n || fee>units(input.pricingType==="percentage"?"1000":"1000000"))
    throw new TypeError("The AOC fee is outside the supported range.");
  if(rate<=0n || rate>units("1000000")) throw new TypeError("Credits per USD must be above zero and at most 1,000,000.");
  return {pricingType:input.pricingType,aocFee:decimal(fee),creditsPerUsd:decimal(rate)};
}
export function previewCreditPricing(input,apiCost="1") {
  const policy=validateCreditPricing(input),cost=units(apiCost);
  if(cost<0n || cost>units("1000000")) throw new TypeError("Use a preview API cost between 0 and 1,000,000 USD.");
  const fee=policy.pricingType==="fixed"?units(policy.aocFee)
    :(cost*units(policy.aocFee)+50n*SCALE)/(100n*SCALE);
  return {apiCostUsd:decimal(cost),aocFeeUsd:decimal(fee),totalClientCostUsd:decimal(cost+fee),
    creditsUsed:decimal(((cost+fee)*units(policy.creditsPerUsd)+SCALE/2n)/SCALE)};
}
export function creditRequestKey(value) {
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value || ""))
    throw new TypeError("Reload the form before saving.");
  return value.toLowerCase();
}
export function validateCreditAdjustment(input) {
  if(!/^[1-9][0-9]{0,18}$/.test(String(input?.clientId)) || BigInt(input.clientId)>9223372036854775807n)
    throw new TypeError("Choose a client.");
  const idempotencyKey=creditRequestKey(input?.idempotencyKey);
  const amount=units(input.amount);
  if(amount===0n || amount>units("1000000000") || amount<units("-1000000000"))
    throw new TypeError("Use a nonzero adjustment of at most 1 billion credits.");
  return {clientId:String(input.clientId),amount:decimal(amount),idempotencyKey};
}
