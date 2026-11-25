import {wantsHalfImagePreview,readPreviewImage,halfSizeImagePreview} from './document-image-preview.js';
import {documentStoragePath,assertDocumentStoragePath} from './client-document-storage-path.js';
import {storageLifecycleReady,queueDocumentCleanup,documentCleanupSummary,sweepDocumentStorage,enqueueDocumentStorageMaintenance} from './client-document-storage-maintenance.js';
import {documentPreviewKind,documentInlineDisposition} from './document-preview-policy.js';
import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {databasePool as db} from './database.js';
import {documentAdmin,documentClient,adminDocumentTransaction} from './document-delivery-access.js';
import {assertTrustedOrigin,readJsonRequest} from './request-security.js';
import {assignmentError,assignmentId,assignmentText,clientId,documentDescription} from './client-document-assignment-policy.js';
import {documentFileCommand} from './client-document-file-policy.js';
import {documentFileFormat} from './client-document-formats.js';
import {privateStorageConfig,signedDocumentUpload,inspectStoredDocument,signedDocumentDownload,openStoredDocumentPreview,removeStoredDocument} from './client-document-storage-provider.js';
import {noteAdminAuditClient,noteAdminAuditSaved} from './admin-audit-context.js';
const privateHeaders={'Cache-Control':'private, no-store','Vary':'Cookie','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff'};
export async function documentObjectsReady(){return (await db.query("SELECT to_regclass('portal_client_document_objects') IS NOT NULL AND to_regclass('portal_client_document_object_audit') IS NOT NULL ready")).rows[0].ready;}
export async function assertDocumentStorageBoundary(){
 const c=privateStorageConfig(),name='aoc_private_documents_'+createHash('md5').update(c.bucket).digest('hex').slice(0,12);
 const row=(await db.query(`SELECT p.permissive,p.cmd,p.roles,p.qual,p.with_check,c.relrowsecurity FROM pg_policies p JOIN pg_namespace n ON n.nspname=p.schemaname JOIN pg_class c ON c.relnamespace=n.oid AND c.relname=p.tablename WHERE p.schemaname='storage' AND p.tablename='objects' AND p.policyname=$1`,[name])).rows[0];
 const normalize=v=>(v||'').replace(/[\s()]/g,'');
 const expected="bucket_id<>'"+c.bucket+"'::text";
 if(!row||!row.relrowsecurity||row.permissive!=='RESTRICTIVE'||row.cmd!=='ALL'||!row.roles.includes('public')||normalize(row.qual)!==expected||normalize(row.with_check)!==expected)throw assignmentError('storage_policy','Private Storage needs its reviewed browser-role restriction. Ask the portal owner to finish setup.',503);
}
export async function directDocumentStorageReady(){try{if(!await documentObjectsReady()||!await storageLifecycleReady(db))return false;await assertDocumentStorageBoundary();return true;}catch{return false;}}
const columns='id,client_id,title,description,filename,mime_type,size_bytes,revision,published_at,updated_at';
const result=row=>({saved:true,id:row.id,revision:String(row.revision),status:row.archived_at?'removed':row.published_at?'published_link':'saved_not_published',title:row.title,sizeBytes:Number(row.size_bytes)});
export const publishedDocumentObjects="FROM portal_client_document_objects f JOIN portal_admins p ON p.user_id=f.published_by AND p.is_active WHERE f.client_id=$1 AND f.state='ready' AND f.published_at IS NOT NULL AND f.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM portal_internal_users i WHERE i.user_id=f.published_by)";
export async function adminDocumentObjects(client){
 if(!await documentObjectsReady())return {files:[],history:[],directUploadsReady:false};
 const files=(await db.query(`SELECT ${columns} FROM portal_client_document_objects WHERE client_id=$1 AND state='ready' AND archived_at IS NULL ORDER BY updated_at DESC,id LIMIT 100`,[client])).rows.map(row=>({id:row.id,clientId:String(row.client_id),title:row.title,description:row.description,filename:row.filename,mimeType:row.mime_type,sizeBytes:Number(row.size_bytes),revision:String(row.revision),publishedAt:row.published_at,updatedAt:row.updated_at,kind:'upload',storage:'supabase',delivery:'storage',status:row.published_at?'published_link':'saved_not_published',url:`/api/admin/client-document-storage/${row.id}?clientId=${client}&revision=${row.revision}`}));
 const history=(await db.query("SELECT action,occurred_at AS \"occurredAt\" FROM portal_client_document_object_audit WHERE client_id=$1 ORDER BY id DESC LIMIT 20",[client])).rows.map(row=>({...row,reason:({upload:'Uploaded private storage document',update:'Updated document',publish:'Shared document',revoke:'Unshared document',archive:'Removed document',storage_rename:'Updated stored filename'})[row.action]}));
 return {files,history,directUploadsReady:await directDocumentStorageReady(),storageCleanup:await documentCleanupSummary(db,client)};
}
function bound(row){assertDocumentStoragePath(String(row.client_id),row.id,row.object_path);const c=privateStorageConfig();if(row.storage_origin!==c.origin||row.bucket!==c.bucket)throw assignmentError('storage_changed','The configured document storage changed. Ask the portal owner to review it.',409);}
function exact(body,keys){if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!keys.includes(k)))throw assignmentError('invalid_upload','Unsupported document upload fields.');}
function prepare(body){
 exact(body,['action','clientId','operation','filename','size','title','description','share']);
 let format;try{format=documentFileFormat(body.filename);}catch(error){throw assignmentError('file_type',error.message,415);}
 if(!Number.isSafeInteger(body.size)||body.size<=0||typeof body.share!=='boolean')throw assignmentError('invalid_upload','Choose a non-empty supported file and visibility.');
 return {clientId:clientId(body.clientId),operation:assignmentId(body.operation),filename:body.filename,size:body.size,title:assignmentText(body.title||body.filename,180),description:documentDescription(body.description||''),share:body.share,mimeType:format.mime};
}
export async function saveStoredDocument(request){
 assertTrustedOrigin(request.headers);const actor=await documentAdmin(request.headers),body=await readJsonRequest(request,6000),client=clientId(body.clientId);
 if(request.headers.has('x-aoc-document-client')&&request.headers.get('x-aoc-document-client')!==client)throw assignmentError('client_changed','The selected client changed. Reload before saving.',409);
 noteAdminAuditClient(client);privateStorageConfig();await assertDocumentStorageBoundary();if(!await documentObjectsReady())throw assignmentError('storage_setup','Private Storage needs the document metadata migration.',503);
 if(!await storageLifecycleReady(db))throw assignmentError('storage_setup','Document Storage needs its cleanup migration before changes can be saved.',503);
 const cleanup=async(fileId=null)=>{try{const report=await sweepDocumentStorage({transaction:work=>adminDocumentTransaction(actor,client,work),config:privateStorageConfig(),remove:removeStoredDocument,client,fileId,retry:true});return {...report,...await documentCleanupSummary(db,client)};}catch{return {pending:1,failed:1};}};
 if(body.action==='cleanup'){
  exact(body,['action','clientId']);await adminDocumentTransaction(actor,client,connection=>enqueueDocumentStorageMaintenance(connection,privateStorageConfig(),client,true));const report=await cleanup();noteAdminAuditSaved({clientId:client,storageRemoved:report.removed||0,storageCleanupPending:report.pending});return {saved:true,storageCleanup:report};
 }
 if(body.action==='prepare'){
  const c=prepare(body),config=privateStorageConfig(),digest=createHash('sha256').update(JSON.stringify(c)).digest('hex');
  const row=await adminDocumentTransaction(actor,client,async connection=>{
   await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('document-object:'||$1,204))",[c.operation]);
   const prior=(await connection.query('SELECT * FROM portal_client_document_objects WHERE operation=$1',[c.operation])).rows[0];
   if(prior){if(prior.digest!==digest||String(prior.actor_id)!==actor.admin.id||String(prior.client_id)!==client)throw assignmentError('request_changed','This upload retry does not match its original client or file.',409);if(prior.archived_at||prior.state==='rejected')throw assignmentError('file_unavailable','This upload is no longer available. Start a new upload.',409);bound(prior);if(prior.state==='pending')await connection.query("UPDATE portal_client_document_objects SET upload_grant_expires_at=clock_timestamp()+interval '125 minutes' WHERE id=$1",[prior.id]);return prior;}
   if((await connection.query('SELECT 1 FROM portal_client_document_file_audit WHERE operation=$1',[c.operation])).rowCount)throw assignmentError('upload_changed','Review the existing library before retrying with a different storage mode.',409);
   const recent=(await connection.query("SELECT (SELECT count(*) FROM portal_client_document_objects WHERE client_id=$1 AND actor_id=$2 AND created_at>now()-interval '1 day')+(SELECT count(*) FROM portal_client_document_files WHERE client_id=$1 AND created_by=$2 AND created_at>now()-interval '1 day') n",[client,actor.admin.id])).rows[0];
   if(Number(recent.n)>=30)throw assignmentError('upload_rate','Please wait before adding more files for this client.',429);
   const id=randomUUID(),path=documentStoragePath(client,id,c.filename);
   return (await connection.query(`INSERT INTO portal_client_document_objects(id,client_id,actor_id,operation,digest,title,description,filename,mime_type,size_bytes,storage_origin,bucket,object_path,share_requested,upload_grant_expires_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,clock_timestamp()+interval '125 minutes') RETURNING *`,[id,client,actor.admin.id,c.operation,digest,c.title,c.description,c.filename,c.mimeType,c.size,config.origin,config.bucket,path,c.share])).rows[0];
  });
  if(row.state==='ready')return {...result(row),duplicate:true};
  return adminDocumentTransaction(actor,client,async connection=>{
   const current=(await connection.query('SELECT * FROM portal_client_document_objects WHERE id=$1 AND client_id=$2 FOR UPDATE',[row.id,client])).rows[0];
   if(!current||current.archived_at||current.state==='rejected')throw assignmentError('upload_unavailable','This upload is no longer available. Choose the file again.',409);bound(current);
   if(current.state==='ready')return {...result(current),duplicate:true};
   await connection.query("UPDATE portal_client_document_objects SET upload_grant_expires_at=now()+interval '125 minutes',updated_at=now() WHERE id=$1",[row.id]);
   const upload=await signedDocumentUpload(current.object_path,Number(current.size_bytes));return {prepared:true,id:current.id,upload};
  });
 }
 if(body.action==='complete'){
  exact(body,['action','clientId','id','operation']);const id=assignmentId(body.id),operation=assignmentId(body.operation);
  const row=(await db.query('SELECT * FROM portal_client_document_objects WHERE id=$1 AND client_id=$2 AND actor_id=$3 AND operation=$4',[id,client,actor.admin.id,operation])).rows[0];
  if(!row||row.archived_at||row.state==='rejected')throw assignmentError('upload_unavailable','The upload is unavailable for this client.',404);bound(row);
  if(row.state==='ready')return adminDocumentTransaction(actor,client,async connection=>{const current=(await connection.query("SELECT * FROM portal_client_document_objects WHERE id=$1 AND client_id=$2 AND state='ready' AND archived_at IS NULL",[id,client])).rows[0];if(!current)throw assignmentError('upload_unavailable','This upload changed.',409);return {...result(current),duplicate:true};});
  const checked=await inspectStoredDocument(row.object_path,row.filename,Number(row.size_bytes));
  return adminDocumentTransaction(actor,client,async connection=>{
   const current=(await connection.query('SELECT * FROM portal_client_document_objects WHERE id=$1 AND client_id=$2 FOR UPDATE',[id,client])).rows[0];
   if(!current||current.archived_at||current.state==='rejected')throw assignmentError('upload_unavailable','The upload changed while being checked.',409);bound(current);
   if(current.state==='ready')return {...result(current),duplicate:true};
   const saved=(await connection.query(`UPDATE portal_client_document_objects SET state='ready',content_hash=$3,mime_type=$4,filename=$5,title=CASE WHEN title=filename THEN $5 ELSE title END,published_by=CASE WHEN share_requested THEN actor_id END,published_at=CASE WHEN share_requested THEN now() END,updated_at=now() WHERE id=$1 AND client_id=$2 RETURNING *`,[id,client,checked.contentHash,checked.mimeType,checked.filename])).rows[0];
   const answer=result(saved);await connection.query("INSERT INTO portal_client_document_object_audit(file_id,client_id,actor_id,operation,digest,action,result) VALUES($1,$2,$3,$4,$5,'upload',$6::jsonb)",[id,client,actor.admin.id,operation,current.digest,JSON.stringify(answer)]);noteAdminAuditSaved({clientId:client,id,title:saved.title,status:answer.status});return answer;
  });
 }
 const command=documentFileCommand(body),digest=createHash('sha256').update(JSON.stringify(command)).digest('hex');
 const answer=await adminDocumentTransaction(actor,client,async connection=>{
  await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('document-object:'||$1,204))",[command.operation]);
  const previous=(await connection.query('SELECT * FROM portal_client_document_object_audit WHERE operation=$1',[command.operation])).rows[0];
  if(previous){if(previous.digest!==digest||String(previous.client_id)!==client||String(previous.actor_id)!==actor.admin.id)throw assignmentError('request_changed','This retry does not match its original request.',409);return {...previous.result,duplicate:true};}
  const row=(await connection.query("SELECT * FROM portal_client_document_objects WHERE id=$1 AND client_id=$2 AND state='ready' AND archived_at IS NULL FOR UPDATE",[command.id,client])).rows[0];
  if(!row)throw assignmentError('file_unavailable','Document unavailable for this client.',404);if(String(row.revision)!==command.revision)throw assignmentError('file_changed','Refresh this document before editing.',409);bound(row);
  const share=command.action==='publish'||command.action==='update'&&command.share;
  const saved=(await connection.query(`UPDATE portal_client_document_objects SET title=COALESCE($3,title),description=COALESCE($4,description),revision=revision+1,updated_at=now(),published_by=CASE WHEN $5 THEN $6::bigint END,published_at=CASE WHEN $5 THEN now() END,archived_at=CASE WHEN $7 THEN now() ELSE archived_at END WHERE id=$1 AND client_id=$2 RETURNING *`,[command.id,client,command.title??null,command.description??null,share,actor.admin.id,command.action==='archive'])).rows[0];
  if(command.action==='archive')await queueDocumentCleanup(connection,saved);
  const answer=result(saved);await connection.query('INSERT INTO portal_client_document_object_audit(file_id,client_id,actor_id,operation,digest,action,result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[command.id,client,actor.admin.id,command.operation,digest,command.action,JSON.stringify(answer)]);noteAdminAuditSaved({clientId:client,id:command.id,title:saved.title,status:answer.status});return answer;
 });
 if(command.action==='archive'){const report=await cleanup(command.id);return {...answer,storageCleanupPending:report.pending>0,storageCleanup:report};}
 return answer;
}
export async function deliverStoredDocument(request,id,admin=false){
 const u=new URL(request.url),client=clientId(u.searchParams.get('clientId')),revision=u.searchParams.get('revision'),mode=u.searchParams.get('mode')||'download';assignmentId(id);
 if(!['view','download'].includes(mode))throw assignmentError('invalid_mode','Choose preview or download.');
 if(!/^[1-9][0-9]{0,14}$/.test(revision||''))throw assignmentError('file_unavailable','Refresh the document library before opening this file.',404);
 const authorize=()=>admin?documentAdmin(request.headers):documentClient(request.headers,client);await authorize();
 if(!await documentObjectsReady())throw assignmentError('file_unavailable','Document unavailable.',404);
 const scope=admin?"FROM portal_client_document_objects f WHERE f.client_id=$1 AND f.state='ready' AND f.archived_at IS NULL":publishedDocumentObjects;
 const get=async()=>(await db.query(`SELECT f.* ${scope} AND f.id=$2 AND f.revision=$3`,[client,id,revision])).rows[0];
 const row=await get();if(!row)throw assignmentError('file_unavailable','Document unavailable for this client.',404);bound(row);
 await assertDocumentStorageBoundary();
 if(mode==='view'){
  if(!documentPreviewKind(row.mime_type))throw assignmentError('preview_unsupported','Preview is available for images and PDFs. Download this file to open it.',415);
  const half=wantsHalfImagePreview(u.searchParams,row.mime_type);
  const upstream=await openStoredDocumentPreview(row.object_path,half?null:request.headers.get('range'),Number(row.size_bytes));
  if(half){
   const source=await readPreviewImage(upstream,Number(row.size_bytes)),preview=await halfSizeImagePreview(source);
   await authorize();if(!await get())throw assignmentError('file_unavailable','Document access changed. Refresh the library.',404);
   return new Response(preview,{headers:{...privateHeaders,'Content-Type':'image/webp','Content-Length':String(preview.length),'Content-Disposition':documentInlineDisposition('preview.webp'),'Content-Security-Policy':"default-src 'none'; frame-ancestors 'self'",'Cross-Origin-Resource-Policy':'same-origin'}});
  }
  try{await authorize();if(!await get())throw assignmentError('file_unavailable','Document access changed. Refresh the library.',404);}catch(error){await upstream.body?.cancel().catch(()=>{});throw error;}
  const headers={...privateHeaders,'Content-Type':row.mime_type,'Content-Disposition':documentInlineDisposition(row.filename),'Accept-Ranges':'bytes','Content-Security-Policy':"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'",'Cross-Origin-Resource-Policy':'same-origin'};
  const length=upstream.headers.get('Content-Length');if(/^[0-9]+$/.test(length||'')&&Number(length)<=Number(row.size_bytes))headers['Content-Length']=length;
  if(upstream.status===206)headers['Content-Range']=upstream.headers.get('Content-Range');
  return new Response(upstream.body,{status:upstream.status,headers});
 }
 const location=await signedDocumentDownload(row.object_path,row.filename);await authorize();if(!await get())throw assignmentError('file_unavailable','Document access changed. Refresh the library.',404);
 return new Response(null,{status:303,headers:{...privateHeaders,Location:location}});
}
