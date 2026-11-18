import {createHmac,randomUUID,timingSafeEqual} from 'node:crypto';
import {spendingPeriod} from './ai-spending-repository.js';

export function usageClearScope(input,now=Date.now()) {
  const scope=input?.scope;
  if(!['client','clients','admin'].includes(scope))throw new TypeError('Choose client chat or AOC Admin chat.');
  const clientId=scope==='client'?String(input.clientId || ''):null;
  if(scope==='client' && (!/^[1-9][0-9]{0,18}$/.test(clientId) || BigInt(clientId)>9223372036854775807n))throw new TypeError('Choose a valid client.');
  if(scope!=='client' && input.clientId)throw new TypeError('Choose one usage scope.');
  const period=input.period || new Date(now).toISOString().slice(0,7);
  const range=period==='all'?null:spendingPeriod(period);
  if(range && period>new Date(now).toISOString().slice(0,7))throw new TypeError('Choose a current or past UTC month.');
  return {scope,clientId,period,action:scope==='admin'?'admin_ai.reply':'client_ai.reply',start:range?.start || null,end:range?.end || null};
}
function signature(value,secret) {
  if(typeof secret!=='string' || secret.length<32)throw Error('Usage clear signing is not configured.');
  return createHmac('sha256',secret).update('aoc-ai-usage-reset-v2:'+value).digest();
}
export function usageClearPreview(input,actorId,secret,now=Date.now()) {
  const plan={...usageClearScope(input,now),actorId:String(actorId),before:new Date(now).toISOString(),operationId:randomUUID(),expiresAt:now+10*60_000};
  const value=Buffer.from(JSON.stringify(plan)).toString('base64url');
  return {plan,token:value+'.'+signature(value,secret).toString('base64url')};
}
export function verifyUsageClearPreview(token,actorId,secret,now=Date.now()) {
  if(typeof token!=='string' || token.length>2400)throw new TypeError('Preview this clear action again.');
  const [value,mac,extra]=token.split('.');
  if(!value || !mac || extra || !/^[A-Za-z0-9_-]+$/.test(mac))throw new TypeError('Preview this clear action again.');
  const actual=Buffer.from(mac,'base64url'),expected=signature(value,secret);
  if(actual.length!==expected.length || !timingSafeEqual(actual,expected))throw new TypeError('The clear preview is invalid. Preview again.');
  let plan;try{plan=JSON.parse(Buffer.from(value,'base64url').toString('utf8'));}catch{throw new TypeError('Preview again.');}
  if(plan.actorId!==String(actorId) || !Number.isFinite(plan.expiresAt) || plan.expiresAt<now || !Number.isFinite(Date.parse(plan.before)) || Date.parse(plan.before)>now
    || !/^[0-9a-f-]{36}$/i.test(plan.operationId || ''))throw new TypeError('The clear preview expired or belongs to another administrator. Preview again.');
  return {...plan,...usageClearScope(plan,now)};
}
