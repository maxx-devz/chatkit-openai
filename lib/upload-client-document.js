"use client";
import {DOCUMENT_UPLOAD_MAX} from './client-document-file-policy.js';
const resumable=new Map();
async function json(response){let data;try{data=await response.json();}catch{const e=Error('The upload result could not be confirmed. Retry safely.');if(!response.ok)e.status=response.status;throw e;}if(!response.ok){const e=Error(data.error||'The file could not be uploaded.');e.status=response.status;throw e;}return data;}
function combined(signal,milliseconds){return signal?AbortSignal.any([signal,AbortSignal.timeout(milliseconds)]):AbortSignal.timeout(milliseconds);}
function encode(value){return btoa(Array.from(new TextEncoder().encode(value),byte=>String.fromCharCode(byte)).join(''));}
async function sendResumable(file,upload,key,signal,onProgress){
 const endpoint=new URL(upload.endpoint),origin=new URL(upload.origin);
 if(endpoint.protocol!=='https:'||![origin.origin,origin.origin.replace('.supabase.co','.storage.supabase.co')].includes(endpoint.origin)||endpoint.pathname!=='/storage/v1/upload/resumable/sign'||endpoint.search||endpoint.hash)throw Error('Private storage returned an invalid resumable endpoint.');
 const headers={'Tus-Resumable':'1.0.0','x-signature':upload.token};let state=resumable.get(key);
 if(state){const head=await fetch(state.url,{method:'HEAD',headers,signal:combined(signal,60000),cache:'no-store',credentials:'omit',redirect:'error'});if(head.ok)state.offset=Number(head.headers.get('Upload-Offset'));else{resumable.delete(key);state=null;}}
 if(!state){
  const metadata=Object.entries({bucketName:upload.bucket,objectName:upload.path,contentType:'application/octet-stream',cacheControl:'0'}).map(([k,v])=>k+' '+encode(v)).join(',');
  const created=await fetch(endpoint.href,{method:'POST',headers:{...headers,'Upload-Length':String(file.size),'Upload-Metadata':metadata},signal:combined(signal,60000),credentials:'omit',redirect:'error'});
  if(!created.ok)throw Error('Storage could not start the large-file upload. Check the project Storage limits and try again.');
  const url=new URL(created.headers.get('Location')||'',endpoint);
  if(url.origin!==endpoint.origin||!url.pathname.startsWith('/storage/v1/upload/resumable/sign/'))throw Error('Storage returned an invalid resumable upload address.');
  state={url:url.href,offset:0};resumable.set(key,state);
 }
 if(!Number.isSafeInteger(state.offset)||state.offset<0||state.offset>file.size)throw Error('Storage returned an invalid upload position.');
 const remove=()=>resumable.delete(key);signal?.addEventListener('abort',remove,{once:true});
 try{while(state.offset<file.size){
  const end=Math.min(state.offset+6*1024*1024,file.size),part=file.slice(state.offset,end);
  const sent=await fetch(state.url,{method:'PATCH',headers:{...headers,'Upload-Offset':String(state.offset),'Content-Type':'application/offset+octet-stream'},body:part,signal:combined(signal,120000),credentials:'omit',redirect:'error'});
  if(!sent.ok)throw Error('The large-file transfer paused. Retry to resume, or check your Storage plan limits.');
  const offset=Number(sent.headers.get('Upload-Offset'));if(offset!==end)throw Error('Storage could not confirm the uploaded part. Retry to resume.');state.offset=offset;onProgress?.({uploaded:offset,total:file.size});
 }}finally{signal?.removeEventListener('abort',remove);}
}
export async function uploadClientDocument({clientId,operation,title,description='',share,file,direct=false,signal,onProgress}){
 if(!direct&&file.size<=DOCUMENT_UPLOAD_MAX){
  const form=new FormData();for(const [key,value] of Object.entries({clientId,operation,title,description,share:String(share)}))form.set(key,value);form.set('file',file);
  return json(await fetch('/api/admin/client-document-files',{method:'POST',cache:'no-store',headers:{'x-aoc-document-client':clientId},body:form,signal:combined(signal,60000)}));
 }
 const post=body=>fetch('/api/admin/client-document-storage',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','x-aoc-document-client':clientId},body:JSON.stringify(body),signal:combined(signal,300000)}).then(json);
 const prepared=await post({action:'prepare',clientId,operation,title,description,share,filename:file.name,size:file.size});
 if(prepared.saved)return prepared;
 if(!prepared.prepared||!prepared.id||!prepared.upload)throw Error('Private Storage did not prepare the upload.');
 const upload=prepared.upload,key=clientId+':'+operation;
 if(upload.stored===true){const result=await post({action:'complete',clientId,id:prepared.id,operation});resumable.delete(key);return result;}
 const url=new URL(upload.signedUrl);
 if(url.origin!==upload.origin||url.protocol!=='https:'||!url.pathname.startsWith('/storage/v1/object/upload/sign/'))throw Error('Private Storage returned an invalid upload address.');
 try{
  if(file.size>6*1024*1024)await sendResumable(file,upload,key,signal,onProgress);
  else{
   const sent=await fetch(url.href,{method:'PUT',headers:{'Content-Type':'application/octet-stream','x-upsert':'false','cache-control':'max-age=0'},body:file,credentials:'omit',signal:combined(signal,120000),redirect:'error'});
   // A retry may encounter a previously stored immutable object. Completion
   // verifies its size/content and the original client/actor before publishing.
   if(!sent.ok&&![400,409].includes(sent.status))throw Error('The file transfer failed. Check Storage limits and retry.');
   onProgress?.({uploaded:file.size,total:file.size});
  }
  const result=await post({action:'complete',clientId,id:prepared.id,operation});resumable.delete(key);return result;
 }catch(error){if(signal?.aborted)resumable.delete(key);throw error;}
}
