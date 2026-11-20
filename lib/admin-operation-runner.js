import {isAdminChangeRequest,changeSummary,responseSavedValues} from './admin-change-policy.js';
import {randomUUID} from 'node:crypto';
import {runAdminAuditContext,noteAdminAuditError} from './admin-audit-context.js';
import {auditInput,auditLocation,auditExplanation,safeAuditCode,safeAuditRoute} from './admin-audit-policy.js';

async function inputMetadata(request){
 const route=safeAuditRoute(request.url),method=request.method;
 let input={};
 if(method==='GET'){const query=new URL(request.url).searchParams;input={clientId:query.get('clientId')};}
 else if(request.headers.get('content-type')?.includes('application/json')){
  const copy=request.clone(),reader=copy.body?.getReader();let text='',bytes=0;
  try{if(reader)for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>150000){reader.cancel().catch(()=>{});break;}text+=new TextDecoder().decode(part.value);}if(bytes<=150000)input=JSON.parse(text);}catch{/* Original handler validates the original body. */}
 }
 return auditInput(input,route,method);
}
export function createAdminAuditedHandler(operation,handler,{append,clock=()=>Date.now(),report=()=>{}}){
 return async function audited(request,...args){
  const start=clock(),requestId=randomUUID(),route=safeAuditRoute(request.url),input=await inputMetadata(request);
  if(!isAdminChangeRequest(route,request.method,input.action))return handler(request,...args);
  const base={requestId,route,method:input.method,operation:operation+(input.action?'.'+input.action:''),category:'change',clientId:input.requested_client_id,
   details:{fields:input.fields,values:input.values,omitted_fields:input.omitted_fields,...(input.requested_client_id?{requested_client_id:input.requested_client_id}:{})}};
  let complete=false,storageFailed=false;
  const state={notes:[],admin:null,begin:async actor=>{try{await append({...base,phase:'started',actor,outcome:'started',summary:'Authorized administrator request started. The final outcome is recorded separately.'});}
   catch{storageFailed=true;const error=new Error('Audit storage unavailable');error.publicDetails={status:503,code:'audit_unavailable',message:'Activity logging is unavailable. The action was not started. Please try again later.'};throw error;}}};
  async function finish(status,outcome,extra={}){if(complete)return;complete=true;
   const note=state.notes.at(-1),code=extra.code||note?.code||(status>=400?'http_'+status:null);
   try{await append({...base,clientId:state.clientId||base.clientId,phase:'finished',actor:state.admin,outcome:state.outcome||outcome,status,duration:clock()-start,code,location:extra.location||note?.location,
    summary:(state.savedValues&&Object.keys(state.savedValues).length&&(state.outcome||outcome)!=='succeeded'?'Some values were saved, but the request could not finish. Review the committed values before retrying.':(state.outcome||outcome)==='succeeded'?changeSummary(route,request.method,input.action,state.duplicate):auditExplanation(state.outcome||outcome,status,code)),details:{...base.details,...(state.savedValues?{saved_values:state.savedValues}:{}),...(state.duplicate?{duplicate:true}:{}),...(state.legacyEvents?.length?{legacy_events:state.legacyEvents}:{})},...extra});}
   catch{storageFailed=true;report({requestId,code:'audit_unavailable'});}
  }
  return runAdminAuditContext(state,async()=>{
   let response;
   try{response=await handler(request,...args);}catch(error){noteAdminAuditError(error);await finish(error?.publicDetails?.status||500,'failed',{code:safeAuditCode(error?.publicDetails?.code||error?.code||error?.name),location:auditLocation(error?.stack)});throw error;}
   if(!(response instanceof Response))return response;
   const outcome=response.status===401||response.status===403?'denied':response.status>=400?'failed':'succeeded';
   const headers=new Headers(response.headers);headers.set('X-AOC-Audit-Reference',requestId);headers.set('Cache-Control','private, no-store');
   if(response.body&&headers.get('content-type')?.includes('text/event-stream')){
    const reader=response.body.getReader(),decoder=new TextDecoder();let pending='',failed=false,cancelled=false;
    const inspect=chunk=>{pending+=decoder.decode(chunk,{stream:true});if(pending.length>65536)pending=pending.slice(-65536);
     const lines=pending.split('\n');pending=lines.pop();for(const line of lines){if(!line.startsWith('data:'))continue;try{const event=JSON.parse(line.slice(5));if(['error','response.failed','response.error'].includes(event.type))failed=true;}catch{/* Text deltas are never retained in the audit. */}}};
    const body=new ReadableStream({async pull(controller){try{const part=await reader.read();if(part.done){await finish(response.status,cancelled?'cancelled':failed?'failed':outcome,failed?{code:'stream_error'}:{});controller.close();}else{inspect(part.value);controller.enqueue(part.value);}}
     catch(error){await finish(response.status,'failed',{code:'stream_error',location:auditLocation(error?.stack)});controller.error(error);}},async cancel(){cancelled=true;await finish(response.status,'cancelled',{code:'request_cancelled'});await reader.cancel();}});
    return new Response(body,{status:response.status,statusText:response.statusText,headers});
   }
   if(response.ok&&response.headers.get('content-type')?.includes('application/json')){try{const payload=await response.clone().json();state.duplicate=payload?.duplicate===true;if(!state.duplicate&&!state.savedValues){const saved=responseSavedValues(route,payload);if(Object.keys(saved).length)state.savedValues=saved;}}catch{/* Do not infer committed values from malformed responses. */}}
   if(response.status>=400&&!state.notes.length&&response.headers.get('content-type')?.includes('application/json')){try{const length=Number(response.headers.get('content-length')||0);if(length<16384){const payload=await response.clone().json();if(payload?.code)state.notes.push({code:safeAuditCode(payload.code)});}}catch{/* No response content is stored. */}}
   await finish(response.status,outcome);if(storageFailed)headers.set('X-AOC-Audit-Status','incomplete');
   return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
  });
 };
}
