import {previewCreditPricing,normalizeCreditDecimal,validateCreditPricing} from "./credits-pricing.js";
export function activePricingChanged(fields,baseline) {
  const payload=value=>({pricingType:value.pricingType,aocFee:value.pricingType==='percentage'?value.percentageFee:value.fixedFee,creditsPerUsd:value.creditsPerUsd});
  try{return JSON.stringify(validateCreditPricing(payload(fields)))!==JSON.stringify(validateCreditPricing(payload(baseline)));}catch{return true;}
}
export function pricingTimeline(versions,period) {
  const ordered=[...versions].sort((a,b)=>b.effectivePeriod.localeCompare(a.effectivePeriod) || (BigInt(a.id)>BigInt(b.id)?-1:1));
  const current=ordered.find(row=>row.effectivePeriod<=period) || null;
  const scheduled=ordered.filter(row=>row.effectivePeriod>period).filter((row,index,list)=>list.findIndex(other=>other.effectivePeriod===row.effectivePeriod)===index)
    .sort((a,b)=>a.effectivePeriod.localeCompare(b.effectivePeriod));
  return {current,scheduled};
}
export function creditAdjustmentReason(value) {
  const text=typeof value==="string"?value.trim().replace(/\s+/g," "):"";
  if(!text || text.length>300 || /[\u0000-\u001f\u007f<>]/.test(text))throw new TypeError("Enter a plain-text adjustment reason of 1–300 characters.");
  return text;
}
const units=value=>{const text=normalizeCreditDecimal(value),negative=text.startsWith("-");const [whole,fraction=""]=text.replace(/^-/,'').split('.');return (BigInt(whole)*10n**12n+BigInt(fraction.padEnd(12,'0')))*(negative?-1n:1n);};
const decimal=value=>{const sign=value<0n?'-':'',absolute=value<0n?-value:value,fraction=(absolute%10n**12n).toString().padStart(12,'0').replace(/0+$/,'');return sign+(absolute/10n**12n).toString()+(fraction?'.'+fraction:'');};
export function previewAllowanceAdjustment(report,amount) {
  const change=units(amount),allocated=units(report.allocatedCredits ?? "0")+change;
  const used=report.creditsUsed==null?null:units(report.creditsUsed);
  return {change:decimal(change),allocatedAfter:decimal(allocated),availableAfter:!report.incomplete && !report.partialHistory && report.pricing && used!=null?decimal(allocated>used?allocated-used:0n):null};
}
export function pricingPreview(input,apiCostUsd) {return previewCreditPricing(input,apiCostUsd);}
