export const changeMethods=new Set(['POST','PUT','PATCH','DELETE']);
const callbackPaths=new Set(['/api/admin/source-connections/callback','/api/admin/client-documents/google/callback']);
export function isAdminChangeRequest(route,method,action){
 if(method==='GET')return callbackPaths.has(route); // OAuth callbacks actually replace a credential grant.
 if(!changeMethods.has(method))return false;
 if(route==='/api/admin/provider-settings'&&method==='POST')return false; // Model catalog, not save (PUT).
 if(route==='/api/admin/credits'&&['preview','adjustment_preview'].includes(action))return false;
 if(route==='/api/admin/ai-usage/history'&&action==='preview')return false;
 return true;
}
export const changeAuditSql=`origin IN ('server','auth') AND (
 (method IN ('POST','PUT','PATCH','DELETE') AND category IN ('change','authentication')
  AND NOT(route='/api/admin/provider-settings' AND method='POST')
  AND NOT(route='/api/admin/credits' AND operation IN ('admin.credits.preview','admin.credits.adjustment_preview'))
  AND NOT(route='/api/admin/ai-usage/history' AND operation='admin.ai_usage.history.preview'))
 OR(method='GET' AND category='change' AND route IN ('/api/admin/source-connections/callback','/api/admin/client-documents/google/callback')))`;
const aliases={display_name:'name',displayName:'name',monthly_price:'price',monthly_credits:'credits',portal_enabled:'portalEnabled',ai_enabled:'aiEnabled',approved_website_url:'approvedWebsiteUrl',hubstaff_project_url:'hubstaffProjectUrl',hubstaff_monthly_hours_limit:'hubstaffMonthlyHoursLimit',openai_vector_store_id:'vectorStoreId',pricing_type:'pricingType',aoc_fee:'aocFee',credits_per_usd:'creditsPerUsd',effective_period:'effectivePeriod'};
const bools=new Set(['portalEnabled','aiEnabled','activate','paymentConfirmed','confirmed','fileSearch','documents','images','enabled','generalReferences','consent','connected','disconnected','published','recorded','cancelled']);
const numbers=new Set(['id','clientId','price','credits','paid','cost','revision','expectedVersion','version','publishedVersion','monthlyPromptLimit','hubstaffMonthlyHoursLimit','documentLimit','imageLimit','aocFee','creditsPerUsd','cleared','costsCleared','clientsReset','recordsProcessed','assignmentRevision']);
const texts={name:160,slug:50,username:50,title:160,model:120,provider:30,status:30,action:40,scope:30,period:12,effectivePeriod:12,pricingType:20,accent:7,vectorStoreId:128,stage:60,currentStage:60,label:180,category:60,audience:60,evidenceType:60};
const sensitive=new Set(['password','apiKey','token','secret','clientSecret','paymentReference','email','instructions','knowledge','messages','greeting','starters','reason','note','content','html','authorization','cookie','confirmation','idempotencyKey']);
function secretLike(value){return /sk-|AIza|gh[pousr]_|Bearer|postgres(?:ql)?:\/\/|BEGIN .*PRIVATE KEY|[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{16,}\.[A-Za-z0-9_-]{12,}|[A-Fa-f0-9]{40,}|@|[\u0000-\u001f\u007f]/i.test(value);}
function publicUrl(value,project){try{const u=new URL(value);if(u.protocol!=='https:'||u.username||u.password||secretLike(u.hostname))return null;if(project&&!/^(?:[a-z0-9-]+\.)*hubstaff\.com$/.test(u.hostname))return null;
 const projectPath=project?u.pathname.match('/projects/([0-9]+)(?:/|$)'):null;if(project&&!projectPath)return null;
 const result=u.origin+(project?'/projects/'+projectPath[1]:'');return result.length<=300&&!secretLike(result)?result:null;}catch{return null;}}
export function safeChangeValues(input){
 const result={};if(!input||typeof input!=='object'||Array.isArray(input))return result;
 for(const [raw,value] of Object.entries(input)){
  const key=aliases[raw]||raw;if(sensitive.has(key))continue;
  if(['stage','currentStage'].includes(key)&&Number.isInteger(value)&&value>=1&&value<=7)result[key]=value;
  else if(bools.has(key)&&typeof value==='boolean')result[key]=value;
  else if(numbers.has(key)&&(value===null||/^[0-9]{1,19}(?:\.[0-9]{1,12})?$/.test(String(value))))result[key]=value===null?null:String(value);
  else if(texts[key]&&(value===null||typeof value==='string'&&value.length<=texts[key]&&!secretLike(value)))result[key]=value;
  else if(key==='approvedWebsiteUrl'&&typeof value==='string'){const url=publicUrl(value,false);if(url)result.websiteDomain=url;}
  else if(key==='hubstaffProjectUrl'&&typeof value==='string'){const url=publicUrl(value,true);if(url)result.hubstaffProject=url;}
  else if(['approvedWebsiteUrl','hubstaffProjectUrl'].includes(key)&&(value===null||value===''))result[key]=value;
 }
 // Only known assistant controls; instruction text and starters are deliberately omitted.
 if(Array.isArray(input.completed)&&input.completed.length<=7&&input.completed.every(value=>Number.isInteger(value)&&value>=1&&value<=7))result.completedStages=input.completed.join(', ');
 if(Array.isArray(input.referencePaths))result.selectedReferenceCount=String(input.referencePaths.length);
 if(Array.isArray(input.instructionIds))result.selectedInstructionCount=String(input.instructionIds.length);
 const config=input.config||input.draft;
 if(config&&typeof config==='object')for(const [key,value] of Object.entries(safeChangeValues(Object.fromEntries(Object.entries(config).filter(([k])=>['fileSearch','documents','images','documentLimit','imageLimit','accent','vectorStoreId'].includes(k))))))result['assistant.'+key]=value;
 return result;
}
export function omittedChangeFields(input){const list=Object.keys(input||{}).filter(key=>sensitive.has(key));for(const key of Object.keys(input?.config||{}))if(sensitive.has(key))list.push('assistant.'+key);return list.slice(0,25);}
export function changeSummary(route,method,action,duplicate){
 if(duplicate)return 'This request was already recorded. No duplicate change was made.';
 if(route==='/api/admin/clients')return method==='POST'?'Client account created.':'Client settings updated.';
 if(route==='/api/admin/client-plan')return ({save:'Monthly client plan saved.',renew:'Monthly payment confirmation recorded.',topup:'Paid AI credits added.',resolve:'Verified usage cost recorded.',decline:'Client request declined.'})[action]||'Client plan request completed.';
 if(route==='/api/admin/provider-settings')return 'AI provider settings saved. Credentials are excluded from this log.';
 if(route==='/api/builder')return ({save:'Assistant draft saved.',publish:'Assistant settings published.',reset:'Assistant draft reset.'})[action]||'Assistant settings updated.';
 if(route==='/api/admin/ai-usage/history')return 'Selected AI usage history reset.';
 if(route==='/api/admin/credits')return action==='pricing'?'Reporting pricing saved.':'Reporting credit adjustment recorded.';
 if(route==='/api/admin/hubstaff-index')return 'Hubstaff synchronization request processed. See job status for completion.';
 return 'The submitted administrator request completed. See its recorded result below.';
}
export function responseSavedValues(route,result){
 if(!result||typeof result!=='object'||result.duplicate===true)return {};
 if(route==='/api/admin/clients'&&result.client)return safeChangeValues(result.client);
 if(route==='/api/builder')return safeChangeValues(result);
 if(route==='/api/admin/provider-settings'&&result.activation)return safeChangeValues({provider:result.activation.provider,model:result.activation.id});
 if(route==='/api/admin/credits'&&result.pricing)return safeChangeValues(result.pricing);
 if(route==='/api/admin/ai-usage/history')return safeChangeValues({cleared:result.cleared,costsCleared:result.costsCleared,clientsReset:result.clientsReset});
 return {};
}
export function boundedChangeDetails(details){
 const value={...details};const size=()=>new TextEncoder().encode(JSON.stringify(value)).length;
 for(const key of ['values','saved_values']){if(size()<=7600)break;if(value[key]){value[key]={};value.values_omitted_for_size=true;}}
 return value;
}
