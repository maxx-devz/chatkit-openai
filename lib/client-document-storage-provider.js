import {documentPreviewRange} from './document-preview-policy.js';
import 'server-only';
import {createHash} from 'node:crypto';
import {documentStorageConfig} from './client-document-storage-config.js';
import {createDocumentInspector} from './client-document-formats.js';
import {assignmentError} from './client-document-assignment-policy.js';
export function privateStorageConfig(){
 let config;try{config=documentStorageConfig();}catch{throw assignmentError('storage_setup','Private file storage needs server setup.',503);}
 const key=process.env.CLIENT_DOCUMENTS_SUPABASE_SERVICE_KEY||'';
 if(!key||!key.startsWith('sb_secret_')&&!key.startsWith('eyJ'))throw assignmentError('storage_setup','Private file storage needs a server-side service key.',503);
 if(key.startsWith('eyJ')){try{const claims=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString());if(claims.role!=='service_role')throw Error();}catch{throw assignmentError('storage_setup','Use the server service-role key, not a browser publishable key.',503);}}
 return {...config,key};
}
const pathFor=(bucket,path)=>encodeURIComponent(bucket)+'/'+path.split('/').map(encodeURIComponent).join('/');
async function call(path,{method='GET',body,timeout=30000,headers={},missingOk=false}={}){
 const c=privateStorageConfig(),auth={apikey:c.key,...(c.key.startsWith('eyJ')?{Authorization:'Bearer '+c.key}:{})};
 let r;try{r=await fetch(c.origin+'/storage/v1/'+path,{method,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(timeout),headers:{...auth,...(body?{'Content-Type':'application/json'}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})});}catch{throw assignmentError('storage_unavailable','Private storage could not be reached. Try again.',503);}
 if(!r.ok){
  if(missingOk){
   if(r.status===404){await r.body?.cancel().catch(()=>{});return null;}
   if(r.status===400){let bytes=0,text='';const reader=r.body?.getReader();try{if(reader)for(;;){const part=await reader.read();if(part.done)break;bytes+=part.value.byteLength;if(bytes>4096)break;text+=new TextDecoder().decode(part.value);}}finally{await reader?.cancel().catch(()=>{});reader?.releaseLock();}
    let data;try{data=JSON.parse(text);}catch{/* Do not disclose provider response content. */}
    if(['NoSuchKey','NoSuchObject','NotFound'].includes(data?.code)||String(data?.statusCode)==='404')return null;
   }
  }
  await r.body?.cancel().catch(()=>{});throw assignmentError(r.status===404?'storage_object_missing':'storage_unavailable',r.status===404?'The file has not finished uploading. Retry the upload.':'Private storage could not complete this request. Check its setup and try again.',r.status===404?409:503);}
 return r;
}
export async function assertPrivateDocumentBucket(){const c=privateStorageConfig(),r=await call('bucket/'+encodeURIComponent(c.bucket)),bucket=await r.json();if(bucket.public!==false)throw assignmentError('storage_public','Client documents require a private Storage bucket.',503);return bucket;}
function signedUrl(value,expected){
 const c=privateStorageConfig();let url;try{url=new URL(/^https:/.test(value)?value:c.origin+'/storage/v1'+value);}catch{throw assignmentError('storage_response','Storage returned an invalid upload address.',503);}
 if(url.origin!==c.origin||url.pathname!==expected||!url.searchParams.get('token'))throw assignmentError('storage_response','Storage returned an invalid scoped address.',503);
 return url;
}
export async function signedDocumentUpload(path,expectedSize){
 const c=privateStorageConfig();await assertPrivateDocumentBucket();
 const existing=async()=>{
  if(!Number.isSafeInteger(expectedSize))return false;
  const response=await call('object/info/'+pathFor(c.bucket,path),{missingOk:true});if(!response)return false;
  const info=await response.json();if(Number(info.size??info.metadata?.size)!==expectedSize)throw assignmentError('storage_size','The stored upload has a different size. Start a new upload with the correct file.',409);
  return true;
 };
 if(await existing())return {stored:true};
 let r;try{r=await call('object/upload/sign/'+pathFor(c.bucket,path),{method:'POST',body:{}});}catch(error){if(Number.isSafeInteger(expectedSize)&&await existing())return {stored:true};throw error;}const data=await r.json();
 const url=signedUrl(data.url,'/storage/v1/object/upload/sign/'+pathFor(c.bucket,path));
 return {signedUrl:url.href,token:url.searchParams.get('token'),origin:c.origin,endpoint:c.origin.replace('.supabase.co','.storage.supabase.co')+'/storage/v1/upload/resumable/sign',bucket:c.bucket,path};
}
export async function inspectStoredDocument(path,filename,expectedSize){
 const c=privateStorageConfig();await assertPrivateDocumentBucket();
 const info=await(await call('object/info/'+pathFor(c.bucket,path))).json();const actual=Number(info.size??info.metadata?.size);
 if(!Number.isSafeInteger(actual)||actual!==expectedSize)throw assignmentError('storage_size','The stored file size does not match the approved upload.',409);
 const response=await call('object/'+pathFor(c.bucket,path),{timeout:240000}),reader=response.body?.getReader();
 if(!reader)throw assignmentError('storage_file','The stored file could not be checked.',409);
 const inspector=createDocumentInspector(filename),hash=createHash('sha256');let size=0;
 try{for(;;){const chunk=await reader.read();if(chunk.done)break;size+=chunk.value.byteLength;if(size>expectedSize)throw Error('The stored file changed while being checked.');inspector.push(chunk.value);hash.update(chunk.value);}
  if(size!==expectedSize)throw Error('The upload is incomplete.');const format=inspector.finish();
  const after=await(await call('object/info/'+pathFor(c.bucket,path))).json();
  if(JSON.stringify([info.id,info.etag,info.updated_at,info.last_modified,info.version,actual])!==JSON.stringify([after.id,after.etag,after.updated_at,after.last_modified,after.version,Number(after.size??after.metadata?.size)]))throw Error('The stored file changed while being checked.');
  return {...format,contentHash:hash.digest('hex')};
 }catch(error){await reader.cancel().catch(()=>{});throw assignmentError('file_validation',error.publicDetails?.message||error.message||'The stored file could not be checked.',415);}finally{reader.releaseLock();}
}
export async function signedDocumentDownload(path,filename){
 const c=privateStorageConfig();await assertPrivateDocumentBucket();
 const r=await call('object/sign/'+pathFor(c.bucket,path),{method:'POST',body:{expiresIn:30}}),data=await r.json();
 const url=signedUrl(data.signedURL||data.signedUrl,'/storage/v1/object/sign/'+pathFor(c.bucket,path));url.searchParams.set('download',filename);return url.href;
}


export async function openStoredDocumentPreview(path,range,size){
 const c=privateStorageConfig();await assertPrivateDocumentBucket();let selected;
 try{selected=documentPreviewRange(range,size);}catch{throw assignmentError('invalid_range','Choose a valid preview range.',416);}
 const response=await call('object/'+pathFor(c.bucket,path),{timeout:240000,headers:selected?{Range:selected}:{}});
 const contentRange=response.headers.get('Content-Range'),length=response.headers.get('Content-Length');
 const expectedRange=selected&&selected.replace('bytes=','bytes ')+'/'+size;
 const expectedLength=response.status===206&&selected?Number(selected.split('-')[1])-Number(selected.split('=')[1].split('-')[0])+1:size;
 if(response.status!==200&&response.status!==206||response.status===206&&(!selected||contentRange!==expectedRange)||length!==null&&(!/^[0-9]+$/.test(length)||Number(length)!==expectedLength)){
  await response.body?.cancel().catch(()=>{});throw assignmentError('storage_preview','The file preview could not be verified. Try downloading it instead.',503);
 }
 return response;
}

export async function removeStoredDocument(path){
 const c=privateStorageConfig();await assertPrivateDocumentBucket();
 await (await call('object/'+encodeURIComponent(c.bucket),{method:'DELETE',body:{prefixes:[path]},timeout:20000})).body?.cancel();
 const remaining=await call('object/info/'+pathFor(c.bucket,path),{missingOk:true});if(remaining){await remaining.body?.cancel();throw assignmentError('storage_cleanup','Storage has not confirmed file removal. Retry cleanup.',503);}
}
export async function copyStoredDocument(source,destination){
 const c=privateStorageConfig();await assertPrivateDocumentBucket();
 const existing=await call('object/info/'+pathFor(c.bucket,destination),{missingOk:true});
 if(existing){await existing.body?.cancel();return;}
 await (await call('object/copy',{method:'POST',body:{bucketId:c.bucket,sourceKey:source,destinationKey:destination},timeout:30000})).body?.cancel();
}
