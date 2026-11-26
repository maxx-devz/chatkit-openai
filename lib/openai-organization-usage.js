// Organization reports are read-only and never change client credits or pricing.
import {createHash} from 'node:crypto';

const TTL=60000,ERROR_TTL=10000,MAX_PAGES=10,MAX_BYTES=2*1024*1024;
const projectPattern=/^proj_[A-Za-z0-9_-]{1,160}$/;
const messages={
 admin_key_rejected:'OpenAI rejected the reporting key. Configure an organization Admin API key, separate from your chat key.',
 admin_permission_required:'The reporting key lacks access. Check its organization Usage and Costs read permissions.',
 provider_rate_limited:'OpenAI temporarily limited reporting requests. Wait briefly, then refresh.',
 report_timeout:'OpenAI reporting timed out. Refresh later; unavailable totals are not treated as zero.',
 invalid_provider_report:'OpenAI returned an incomplete or unsupported report. Refresh later; no totals were assumed.',
 report_too_large:'This report exceeds the safe reporting limit. Configure OPENAI_USAGE_PROJECT_IDS to narrow the scope.',
 provider_unavailable:'OpenAI reporting is temporarily unavailable. Your chat key and client balances were not changed.',
};
class ReportError extends Error{constructor(code){super(code);this.code=code;}}
function invalid(){throw new ReportError('invalid_provider_report');}
export function organizationReportPeriod(period,now=Date.now()){
 const month=period||new Date(now).toISOString().slice(0,7);
 if(!/^20\d{2}-(0[1-9]|1[0-2])$/.test(month)||month>new Date(now).toISOString().slice(0,7))throw new TypeError('Choose a current or past UTC month.');
 const start=Date.parse(month+'-01T00:00:00Z'),next=new Date(start);next.setUTCMonth(next.getUTCMonth()+1);
 return {month,start:Math.floor(start/1000),end:Math.floor(Math.min(next.getTime(),now)/1000)};
}
function configuration(env){
 const key=(env.OPENAI_ADMIN_KEY||'').trim();
 const projects=[...new Set((env.OPENAI_USAGE_PROJECT_IDS||'').split(',').map(s=>s.trim()).filter(Boolean))].sort();
 if(projects.length>20||projects.some(id=>!projectPattern.test(id)))return {error:'Configure OPENAI_USAGE_PROJECT_IDS with up to 20 comma-separated OpenAI project IDs.'};
 // Never silently substitute a chat/project key or decrypt the chat settings.
 const organization=env.OPENAI_USAGE_ORGANIZATION_ID||"";
 if(organization&&!/^org-[A-Za-z0-9_-]{1,160}$/.test(organization))return {error:"Invalid reporting organization."};
 return {key,projects,organization};
}
async function boundedJson(response){
 const reader=response.body?.getReader();if(!reader)invalid();
 const chunks=[];let size=0;
 try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_BYTES){await reader.cancel();throw new ReportError('report_too_large');}chunks.push(Buffer.from(value));}}
 finally{reader.releaseLock();}
 try{return JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{invalid();}
}
function count(value,optional=false){if(optional&&(value===undefined||value===null))return null;if(!Number.isSafeInteger(value)||value<0)invalid();return value;}
function label(value,optional=false){if(optional&&value==null)return null;if(typeof value!=='string'||value.length>200||/[\x00-\x1f\x7f]/.test(value))invalid();return value;}
function add(a,b){if(a===null||b===null)return null;return count(a+b);}
function moneyUnits(value){if(typeof value!=='number'||!Number.isFinite(value)||Math.abs(value)>1e9)invalid();return BigInt(value.toFixed(12).replace('.',''));}
function decimal(units){const sign=units<0n?'-':'',abs=units<0n?-units:units;return sign+String(abs/1000000000000n)+'.'+String(abs%1000000000000n).padStart(12,'0');}
function normalize(buckets,kind,range,projects){
 const rows=[],seen=new Set();
 const totals={requests:0,inputTokens:0,outputTokens:0,cachedInputTokens:0,cacheWriteTokens:0,inputAudioTokens:0,outputAudioTokens:0};let dollars=0n;
 for(const bucket of buckets){
  if(bucket?.object!=='bucket'||!Number.isSafeInteger(bucket.start_time)||!Number.isSafeInteger(bucket.end_time)||bucket.start_time<range.start||bucket.start_time>=range.end||bucket.end_time<=bucket.start_time||!Array.isArray(bucket.results))invalid();
  const date=new Date(bucket.start_time*1000).toISOString().slice(0,10);
  for(const result of bucket.results){
   const projectId=label(result?.project_id,true);
   if(projectId!==null&&!projectPattern.test(projectId)||projects.length&&!projects.includes(projectId))invalid();
   const common={date,projectId};let row;
   if(kind==='usage'){
    if(result.object!=='organization.usage.completions.result')invalid();
    row={...common,model:label(result.model,true),requests:count(result.num_model_requests),inputTokens:count(result.input_tokens),outputTokens:count(result.output_tokens),cachedInputTokens:count(result.input_cached_tokens,true),cacheWriteTokens:count(result.input_cache_write_tokens,true),inputAudioTokens:count(result.input_audio_tokens,true),outputAudioTokens:count(result.output_audio_tokens,true)};
    if(row.cachedInputTokens!==null&&row.cachedInputTokens>row.inputTokens||row.cacheWriteTokens!==null&&row.cacheWriteTokens>row.inputTokens||row.cachedInputTokens!==null&&row.cacheWriteTokens!==null&&row.cachedInputTokens+row.cacheWriteTokens>row.inputTokens)invalid();
    const identity=JSON.stringify([bucket.start_time,bucket.end_time,projectId,row.model]);if(seen.has(identity))invalid();seen.add(identity);
    for(const name of Object.keys(totals))totals[name]=add(totals[name],row[name]);
   }else{
    if(result.object!=='organization.costs.result'||result.amount?.currency?.toLowerCase()!=='usd')invalid();
    const amount=moneyUnits(result.amount.value);dollars+=amount;
    row={...common,lineItem:label(result.line_item,true),amountUsd:decimal(amount)};
    const identity=JSON.stringify([bucket.start_time,bucket.end_time,projectId,row.lineItem]);if(seen.has(identity))invalid();seen.add(identity);
   }
   rows.push(row);if(rows.length>3000)throw new ReportError('report_too_large');
  }
 }
 return kind==='usage'?{status:'ready',totals,rows}:{status:'ready',totalUsd:decimal(dollars),rows};
}

export function createOrganizationUsageReporter({env={},fetchImpl=globalThis.fetch,now=Date.now}={}){
 const cache=new Map();
 async function section(kind,config,range,deadline){
  try{
   if(range.end<=range.start)return normalize([],kind,range,config.projects);
   const buckets=[],pages=new Set();let page,organizationId=config.organization||null;
   for(let index=0;index<MAX_PAGES;index++){
    const url=new URL(kind==='usage'?'https://api.openai.com/v1/organization/usage/completions':'https://api.openai.com/v1/organization/costs');
    url.searchParams.set('start_time',String(range.start));url.searchParams.set('end_time',String(range.end));url.searchParams.set('bucket_width','1d');url.searchParams.set('limit','31');
    for(const project of config.projects)url.searchParams.append('project_ids',project);
    for(const group of (kind==='usage'?['project_id','model']:['project_id','line_item']))url.searchParams.append('group_by',group);
    if(page)url.searchParams.set('page',page);
    const response=await fetchImpl(url,{headers:{Authorization:'Bearer '+config.key,Accept:'application/json',...(config.organization?{'OpenAI-Organization':config.organization}:{})},cache:'no-store',redirect:'error',signal:AbortSignal.any([deadline,AbortSignal.timeout(8000)])});
    if(!response.ok){await response.body?.cancel().catch(()=>{});throw new ReportError(response.status===401?'admin_key_rejected':response.status===403?'admin_permission_required':response.status===429?'provider_rate_limited':'provider_unavailable');}
    const observed=response.headers.get('openai-organization');
    if(observed&&/^org-[A-Za-z0-9_-]{1,160}$/.test(observed)){if(organizationId&&organizationId!==observed)invalid();organizationId=observed;}
    const data=await boundedJson(response);
    if(data?.object!=='page'||!Array.isArray(data.data)||typeof data.has_more!=='boolean')invalid();
    buckets.push(...data.data);
    if(!data.has_more)return {...normalize(buckets,kind,range,config.projects),organizationId};
    const next=data.next_page;if(typeof next!=='string'||!next||next.length>4096||pages.has(next))invalid();pages.add(next);page=next;
   }
   throw new ReportError('report_too_large');
  }catch(error){const code=error instanceof ReportError?error.code:['TimeoutError','AbortError'].includes(error?.name)?'report_timeout':'provider_unavailable';return {status:'unavailable',code,message:messages[code]};}
 }
 return async function load(month){
  const range=organizationReportPeriod(month,now()),config=configuration(env);
  const base={period:range.month,range:{start:new Date(range.start*1000).toISOString(),end:new Date(range.end*1000).toISOString()},scope:{kind:config.projects?.length?'projects':'organization',projectIds:config.projects||[]},cacheSeconds:TTL/1000};
  if(config.error)return {...base,configured:false,setupMessage:config.error,requiredConfiguration:[]};
  if(!config.key)return {...base,configured:false,setupMessage:'Connect an OpenAI organization Admin API key to view provider-reported dollars and tokens. Your paid chat key is separate.',requiredConfiguration:['OPENAI_ADMIN_KEY']};
  const key=createHash('sha256').update(config.key).update(JSON.stringify(config.projects)).update(config.organization||'').update(range.month).digest('hex');
  const hit=cache.get(key);if(hit&&hit.expires>now())return {...await hit.promise,cached:true};
  if(cache.size>=12){const expired=[...cache].find(([,value])=>value.expires<=now());if(expired)cache.delete(expired[0]);else if(!cache.has(key))return {...base,configured:true,usage:{status:'unavailable',code:'provider_rate_limited',message:messages.provider_rate_limited},costs:{status:'unavailable',code:'provider_rate_limited',message:messages.provider_rate_limited},cached:false,fetchedAt:new Date(now()).toISOString()};}
  const entry={expires:now()+TTL,promise:null};
  entry.promise=(async()=>{
   const deadline=AbortSignal.timeout(20000);
   const [usage,costs]=await Promise.all([section('usage',config,range,deadline),section('costs',config,range,deadline)]);
   if(usage.organizationId&&costs.organizationId&&usage.organizationId!==costs.organizationId)return {...base,configured:true,usage:{status:"unavailable",code:"invalid_provider_report",message:messages.invalid_provider_report},costs:{status:"unavailable",code:"invalid_provider_report",message:messages.invalid_provider_report},cached:false,fetchedAt:new Date(now()).toISOString()};
   const report={...base,configured:true,organizationId:usage.organizationId||costs.organizationId||config.organization||null,usage,costs,cached:false,cacheSeconds:(usage.status==='ready'&&costs.status==='ready'?TTL:ERROR_TTL)/1000,fetchedAt:new Date(now()).toISOString()};
   entry.expires=now()+(usage.status==='ready'&&costs.status==='ready'?TTL:ERROR_TTL);
   return report;
  })();cache.set(key,entry);return entry.promise;
 };
}
