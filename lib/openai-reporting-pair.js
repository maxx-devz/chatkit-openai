// Metadata-only verification. Never generates a reply or returns provider bodies.
import {createHash} from 'node:crypto';
const projectPattern=/^proj_[A-Za-z0-9_-]{1,160}$/;
const organizationPattern=/^org-[A-Za-z0-9_-]{1,160}$/;
export class OpenAIReportingError extends Error {
 constructor(message,status=400){super(message);this.status=status;}
}
export function chatKeyFingerprint(key){return createHash('sha256').update(key).digest('hex');}
export function reportingBindingMatches(binding,key){return Boolean(binding&&binding.chatKeyHash===chatKeyFingerprint(key)&&(binding.scope==='organization'?(!binding.organizationId||organizationPattern.test(binding.organizationId)):(projectPattern.test(binding.projectId)&&organizationPattern.test(binding.organizationId))));}
async function metadata(url,key,headers,signal,fetchImpl){
 let response;
 try{response=await fetchImpl(url,{method:'GET',headers:{Authorization:'Bearer '+key,Accept:'application/json',...headers},redirect:'error',cache:'no-store',signal});}
 catch{throw new OpenAIReportingError('OpenAI connection verification timed out or is unavailable. Nothing was saved.',503);}
 if(!response.ok){await response.body?.cancel().catch(()=>{});throw new OpenAIReportingError(response.status===401?'OpenAI rejected a key. Use a chat API key and a separate organization Admin key.':response.status===403?'OpenAI denied access. Check the chat key access and the Admin key Usage read and Costs read permissions.':response.status===429?'OpenAI temporarily limited verification. Wait briefly and retry.':'OpenAI could not verify this connection. Nothing was saved.',response.status===429?429:400);}
 let raw='';try{const reader=response.body.getReader();try{while(true){const {done,value}=await reader.read();if(done)break;raw+=new TextDecoder().decode(value);if(raw.length>2*1024*1024){await reader.cancel();throw Error();}}}finally{reader.releaseLock();}return {data:JSON.parse(raw),organizationId:organizationPattern.test(response.headers.get('openai-organization')||'')?response.headers.get('openai-organization'):null,projectId:projectPattern.test(response.headers.get('openai-project')||'')?response.headers.get('openai-project'):null};}catch{throw new OpenAIReportingError('OpenAI returned an unsupported verification response. Nothing was saved.',503);}
}
export async function verifyOpenAIReportingPair({chatKey,adminKey},{fetchImpl=fetch,now=Date.now,signal}={}){
 if(typeof adminKey!=='string'||!/^sk-admin-[A-Za-z0-9_-]{16,500}$/.test(adminKey.trim()))throw new OpenAIReportingError('Enter a separate OpenAI organization Admin API key.');
 if(typeof chatKey!=='string'||!/^sk-[A-Za-z0-9_-]{16,500}$/.test(chatKey)||chatKey.startsWith('sk-admin-')||chatKey.startsWith('sk-or-'))throw new OpenAIReportingError('Enter an OpenAI chat API key, not an Admin or OpenRouter key.');
 const deadline=AbortSignal.any([AbortSignal.timeout(20000),...(signal?[signal]:[])]);
 const models=await metadata('https://api.openai.com/v1/models',chatKey,{},deadline,fetchImpl);
 if(!Array.isArray(models.data.data))throw new OpenAIReportingError('OpenAI could not verify this chat key.');
 const organizations=new Set();
 const end=Math.floor(now()/1000),start=end-86400;
 for(const endpoint of ['usage/completions','costs']){
  const url=new URL('https://api.openai.com/v1/organization/'+endpoint);
  for(const [key,value] of Object.entries({start_time:String(start),end_time:String(end),bucket_width:'1d',limit:'1'}))url.searchParams.set(key,value);
  const report=await metadata(url,adminKey,{},deadline,fetchImpl);
  if(report.data.object!=='page'||!Array.isArray(report.data.data))throw new OpenAIReportingError('OpenAI could not verify Usage and Costs access.');
  if(report.organizationId)organizations.add(report.organizationId);
 }
 const organizationId=[...organizations][0]||null;
 if(organizations.size>1||(organizationId&&models.organizationId&&organizationId!==models.organizationId))throw new OpenAIReportingError('The chat and reporting keys belong to different OpenAI organizations. Nothing was saved.');
 return {adminKey:adminKey.trim(),binding:{scope:'organization',organizationId,chatOrganizationId:models.organizationId,chatProjectId:models.projectId,organizationMatch:organizationId&&models.organizationId?'verified':'not_supplied',chatKeyHash:chatKeyFingerprint(chatKey),checkedAt:new Date(now()).toISOString()}};
}
