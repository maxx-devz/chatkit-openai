import {wantsHalfImagePreview,halfSizeImagePreview} from './document-image-preview.js';
import {documentPreviewKind} from './document-preview-policy.js';
import {adminDocumentObjects} from './client-document-storage.js';
import 'server-only';
import {createHash,randomUUID} from 'node:crypto';
import {databasePool as db} from './database.js';
import {documentAdmin,documentClient,adminDocumentTransaction} from './document-delivery-access.js';
import {assertTrustedOrigin,readJsonRequest} from './request-security.js';
import {assignmentError,assignmentId,clientId} from './client-document-assignment-policy.js';
import {readDocumentFile,documentFileCommand} from './client-document-file-policy.js';
import {noteAdminAuditClient,noteAdminAuditSaved} from './admin-audit-context.js';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
export async function documentFilesReady(){return (await db.query("SELECT to_regclass('portal_client_document_files') IS NOT NULL AND to_regclass('portal_client_document_file_audit') IS NOT NULL ready")).rows[0].ready;}
const metadata=`id,client_id,title,description,filename,mime_type,octet_length(content) AS size_bytes,revision,published_at,updated_at`;
export function adminFileRecord(row){return {id:row.id,clientId:String(row.client_id),title:row.title,description:row.description,filename:row.filename,mimeType:row.mime_type,sizeBytes:row.size_bytes,kind:'upload',delivery:'upload',revision:String(row.revision),updatedAt:row.updated_at,publishedAt:row.published_at,status:row.published_at?'published_link':'saved_not_published',url:`/api/admin/client-document-files/${row.id}?clientId=${row.client_id}&revision=${row.revision}&mode=view`};}
export async function adminDocumentFiles(client){
 if(!await documentFilesReady())return {uploadsReady:false,files:[],history:[]};
 const stored=await adminDocumentObjects(client);
 const files=(await db.query(`SELECT ${metadata} FROM portal_client_document_files WHERE client_id=$1 AND archived_at IS NULL ORDER BY updated_at DESC,id LIMIT 100`,[client])).rows.map(adminFileRecord);
 const history=(await db.query(`SELECT audit.action,audit.occurred_at AS "occurredAt",actor.display_name AS "actorName" FROM portal_client_document_file_audit audit JOIN portal_users actor ON actor.id=audit.actor_id WHERE audit.client_id=$1 ORDER BY audit.id DESC LIMIT 20`,[client])).rows.map(row=>({...row,reason:({upload:'Uploaded document',update:'Updated document',publish:'Shared document',revoke:'Unshared document',archive:'Removed document from portal'})[row.action]}));
 return {uploadsReady:true,storageCleanup:stored.storageCleanup,directUploadsReady:stored.directUploadsReady,files:[...files,...stored.files],history:[...history,...stored.history]};
}
export const publishedDocumentFiles=`FROM portal_client_document_files f JOIN portal_admins uploader ON uploader.user_id=f.published_by AND uploader.is_active WHERE f.client_id=$1 AND f.published_at IS NOT NULL AND f.archived_at IS NULL AND NOT EXISTS(SELECT 1 FROM portal_internal_users i WHERE i.user_id=f.published_by)`;
export async function saveDocumentFile(request){
 assertTrustedOrigin(request.headers);const actor=await documentAdmin(request.headers);
 const command=request.headers.get('content-type')?.startsWith('multipart/form-data')?await readDocumentFile(request):documentFileCommand(await readJsonRequest(request,5000));
 if(request.headers.has('x-aoc-document-client')&&request.headers.get('x-aoc-document-client')!==command.clientId)throw assignmentError('client_changed','The selected client changed. Reload before saving.',409);
 noteAdminAuditClient(command.clientId);
 if(!await documentFilesReady())throw assignmentError('setup_required','File upload storage needs its database migration. Links still work.',503);
 const contentHash=command.content?createHash('sha256').update(command.content).digest('hex'):undefined;
 const digest=createHash('sha256').update(JSON.stringify({...command,content:undefined,contentHash})).digest('hex');
 return adminDocumentTransaction(actor,command.clientId,async connection=>{
  await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('document-file-operation:'||$1,203))",[command.operation]);
  const previous=(await connection.query('SELECT * FROM portal_client_document_file_audit WHERE operation=$1',[command.operation])).rows[0];
  if(previous){if(previous.digest!==digest||String(previous.client_id)!==command.clientId||String(previous.actor_id)!==actor.admin.id)throw assignmentError('request_changed','This retry does not match the original request.',409);return {...previous.result,duplicate:true};}
  let row;
  if(command.action==='upload'){
   const quota=(await connection.query('SELECT COALESCE(sum(octet_length(content)),0)::bigint bytes,count(*) FILTER (WHERE created_by=$2 AND created_at>now()-interval \'1 day\')::int recent FROM portal_client_document_files WHERE client_id=$1',[command.clientId,actor.admin.id])).rows[0];
   if(Number(quota.bytes)+command.content.length>100*1024*1024)throw assignmentError('storage_limit','This client has reached the 100 MB upload storage limit. Contact the portal owner.',413);
   if(quota.recent>=30)throw assignmentError('upload_rate','Please wait before adding more files for this client.',429);
   row=(await connection.query(`INSERT INTO portal_client_document_files(id,client_id,title,description,filename,mime_type,content,content_hash,created_by,updated_by,published_by,published_at)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$9,CASE WHEN $10 THEN $9::bigint END,CASE WHEN $10 THEN now() END) RETURNING ${metadata}`,[randomUUID(),command.clientId,command.title,command.description,command.filename,command.mimeType,command.content,contentHash,actor.admin.id,command.share])).rows[0];
  }else{
   row=(await connection.query(`SELECT ${metadata} FROM portal_client_document_files WHERE id=$1 AND client_id=$2 AND archived_at IS NULL FOR UPDATE`,[command.id,command.clientId])).rows[0];
   if(!row)throw assignmentError('file_unavailable','This file is unavailable for the selected client.',404);
   if(String(row.revision)!==command.revision)throw assignmentError('file_changed','This document changed. Refresh before trying again.',409);
   const share=command.action==='publish'||command.action==='update'&&command.share;
   row=(await connection.query(`UPDATE portal_client_document_files SET title=COALESCE($3,title),description=COALESCE($4,description),revision=revision+1,updated_at=now(),updated_by=$5,
    published_by=CASE WHEN $6 THEN $5::bigint END,published_at=CASE WHEN $6 THEN now() END,archived_at=CASE WHEN $7 THEN now() ELSE archived_at END,content=CASE WHEN $7 THEN ''::bytea ELSE content END WHERE id=$1 AND client_id=$2 RETURNING ${metadata}`,[command.id,command.clientId,command.title??null,command.description??null,actor.admin.id,share,command.action==='archive'])).rows[0];
  }
  const result={saved:true,id:row.id,revision:String(row.revision),status:command.action==='archive'?'removed':row.published_at?'published_link':'saved_not_published',sizeBytes:row.size_bytes,title:row.title};
  await connection.query('INSERT INTO portal_client_document_file_audit(file_id,client_id,actor_id,operation,digest,action,result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[row.id,command.clientId,actor.admin.id,command.operation,digest,command.action,JSON.stringify(result)]);
  noteAdminAuditSaved({clientId:command.clientId,id:row.id,title:row.title,status:result.status});return result;
 });
}
export async function deliverUploadedDocument(request,id,admin=false){
 const params=new URL(request.url).searchParams,client=clientId(params.get('clientId')),revision=params.get('revision'),mode=params.get('mode')||'download';assignmentId(id);
 if(!/^[1-9][0-9]{0,14}$/.test(revision||'')||!['view','download'].includes(mode))throw assignmentError('file_unavailable','This file link is no longer available. Refresh your documents.',404);
 const authorize=()=>admin?documentAdmin(request.headers):documentClient(request.headers,client);await authorize();
 if(!await documentFilesReady())throw assignmentError('file_unavailable','File unavailable.',404);
 const scope=admin?'FROM portal_client_document_files f WHERE f.client_id=$1 AND f.archived_at IS NULL':publishedDocumentFiles;
 const row=(await db.query(`SELECT f.filename,f.mime_type,f.content ${scope} AND f.id=$2 AND f.revision=$3`,[client,id,revision])).rows[0];
 if(!row)throw assignmentError('file_unavailable','File unavailable in this client workspace.',404);
 await authorize();if(!(await db.query(`SELECT 1 ${scope} AND f.id=$2 AND f.revision=$3`,[client,id,revision])).rowCount)throw assignmentError('file_unavailable','Document access changed. Refresh your library.',404);
 if(wantsHalfImagePreview(params,row.mime_type)){
  const preview=await halfSizeImagePreview(row.content);await authorize();if(!(await db.query(`SELECT 1 ${scope} AND f.id=$2 AND f.revision=$3`,[client,id,revision])).rowCount)throw assignmentError('file_unavailable','Document access changed. Refresh your library.',404);
  return new Response(preview,{headers:{...headers,'Content-Type':'image/webp','Content-Length':String(preview.length),'Content-Disposition':'inline; filename="preview.webp"','Content-Security-Policy':"default-src 'none'; frame-ancestors 'self'",'Cross-Origin-Resource-Policy':'same-origin'}});
 }
 const inline=mode==='view'&&Boolean(documentPreviewKind(row.mime_type));
 const fallback=row.filename.replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/^\.+/,'').slice(0,160)||'document';
 const encoded=encodeURIComponent(row.filename).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());
 return new Response(row.content,{headers:{...headers,'Content-Type':row.mime_type,'Content-Length':String(row.content.length),'Content-Disposition':`${inline?'inline':'attachment'}; filename="${fallback}"; filename*=UTF-8''${encoded}`,'Content-Security-Policy':inline?"default-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'self'":"sandbox; default-src 'none'; frame-ancestors 'self'",'Cross-Origin-Resource-Policy':'same-origin'}});
}
