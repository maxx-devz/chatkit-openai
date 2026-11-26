import {normalizeCreditDecimal,creditRequestKey} from './credits-pricing.js';
export const PLAN_CREDITS_PER_USD=1000;
export function planClientId(value) {
 const text=String(value??'');if(!/^[1-9][0-9]{0,18}$/.test(text)||BigInt(text)>9223372036854775807n)throw new TypeError('Choose a valid client.');return text;
}
export function planText(value,max=300) {
 const text=typeof value==='string'?value.trim():'';
 if(!text||text.length>max||/[\u0000-\u001f\u007f<>]/.test(text))throw new TypeError('Enter a short plain-text reason or reference.');return text;
}
export function planMoney(value,{positive=false}={}) {
 const text=String(value??'');if(!/^(?:0|[1-9][0-9]{0,6})(?:\.[0-9]{1,2})?$/.test(text)||Number(text)>1000000||(positive&&Number(text)<=0))throw new TypeError('Enter a USD amount with at most two decimal places.');return Number(text).toFixed(2);
}
export function planCredits(value) {
 const text=String(value??'');if(!/^[1-9][0-9]{0,9}$/.test(text)||BigInt(text)>1000000000n)throw new TypeError('Enter 1 to 1,000,000,000 whole credits.');return text;
}
export function planPeriod(value=new Date().toISOString().slice(0,7)) {
 if(!/^20[0-9]{2}-(0[1-9]|1[0-2])$/.test(value)||value>new Date().toISOString().slice(0,7))throw new TypeError('Choose a current or past month.');return value;
}
export function planMutation(input) {
 const out={clientId:planClientId(input.clientId),id:creditRequestKey(input.idempotencyKey),action:input.action,reason:planText(input.reason)};
 if(input.action==='save') {
  if(!['active','paused'].includes(input.status))throw new TypeError('Choose an active or paused plan.');
  if(!/^[0-9]{1,15}$/.test(String(input.expectedVersion??'')))throw new TypeError('Refresh the client plan before saving.');
  Object.assign(out,{price:planMoney(input.price),credits:planCredits(input.credits),status:input.status,expectedVersion:String(input.expectedVersion),activate:input.activate===true});
 }else if(input.action==='renew')out.activate=true;
 else if(input.action==='topup')Object.assign(out,{credits:planCredits(input.credits),paid:planMoney(input.paid,{positive:true}),requestId:input.requestId?creditRequestKey(input.requestId):null});
 else if(input.action==='resolve'){const cost=normalizeCreditDecimal(input.cost);if(cost.startsWith('-')||Number(cost)>1000000)throw new TypeError('Enter a verified nonnegative provider cost.');Object.assign(out,{runId:creditRequestKey(input.runId),cost});}
 else if(input.action==='release')out.runId=creditRequestKey(input.runId);
 else if(input.action==='decline')out.requestId=creditRequestKey(input.requestId);
 else throw new TypeError('Choose a supported plan action.');
 if(out.activate||out.action==='topup') {
  if(input.paymentConfirmed!==true)throw new TypeError('Confirm the payment outside the portal before activating credits.');
  out.paymentReference=planText(input.paymentReference,160);
 }
 return out;
}
export function planAvailability({configured,status,entitled,pending,pendingState='review',remaining}) {
 if(!configured)return {canGenerate:true,code:'legacy',message:'No credit-limited plan is active. Existing AI access is unchanged.'};
 if(status!=='active')return {canGenerate:false,code:'plan_paused',message:'Your AI plan is paused. Contact your administrator.'};
 if(!entitled)return {canGenerate:false,code:'plan_payment_due',message:'This month’s AI credits are waiting for admin payment confirmation.'};
 if(pending)return {canGenerate:false,code:'plan_pending',usageState:pendingState==='running'?'running':'review',message:pendingState==='running'?'An AI reply is in progress. Credits will update when it finishes.':'AI is temporarily unavailable. Please contact your administrator. Your available portal credits are unchanged.'};
 if(Number(remaining)<=0)return {canGenerate:false,code:'plan_exhausted',message:'Your AI credits are used up. Request more credits or a plan upgrade.'};
 return {canGenerate:true,code:'available',message:'AI credits are available.'};
}
