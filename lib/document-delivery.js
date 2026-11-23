import "server-only";
import {documentOpenLabel} from "./document-open-label.js";
import {publishedLinks,openPublishedDocumentLink,assignmentMetadata} from "./client-document-links.js";
import {clientStepForStage,internalStagesForClientStep} from "./client-journey.js";
import {clientDocumentFilters,documentSearchPattern} from "./client-document-filters.js";
import {createHash,randomUUID} from "node:crypto";
import {databasePool as db} from "./database.js";
import {assertTrustedOrigin,readJsonRequest} from "./request-security.js";
import {assignmentError,assignmentId,clientId} from "./client-document-assignment-policy.js";
import {assignmentHeaders,assignmentFailure} from "./client-document-assignments.js";
import {documentAdmin,documentClient,adminDocumentTransaction} from "./document-delivery-access.js";
import {openDocumentDrive,documentConnectionStatus} from "./document-drive.js";
import {deliveryCommand,documentConfig,checkDocument,verifyReleasedFile,documentFilename} from "./document-delivery-policy.js";
export const documentHeaders={...assignmentHeaders,"Referrer-Policy":"no-referrer"};
export const documentResponse=(data,status=200)=>Response.json(data,{status,headers:documentHeaders});
export function documentFailure(error){const r=assignmentFailure(error);r.headers.set('Referrer-Policy','no-referrer');return r;}
export async function deliveryReady(){return (await db.query("SELECT to_regclass('portal_document_releases') IS NOT NULL ready")).rows[0].ready;}
async function assignment(id,client,connection=db,lock=false){
 const row=(await connection.query("SELECT * FROM portal_client_document_assignments WHERE id=$1 AND client_id=$2 AND archived_at IS NULL"+(lock?" FOR SHARE":""),[id,client])).rows[0];
 if(!row)throw assignmentError('reference_unavailable','This reference is unavailable for the selected client.',404);return row;
}
const journeyRecord=r=>r?{revision:String(r.revision),currentStage:r.current_stage,completed:r.completed,stageLabels:r.stage_labels,nextAction:r.next_action,evidenceType:r.evidence_type,evidenceSummary:r.evidence_summary,updatedAt:r.updated_at}:null;
export async function adminDocumentDelivery(headers,id){
 const actor=await documentAdmin(headers),client=clientId(id);
 const exists=(await db.query("SELECT 1 FROM portal_clients WHERE id=$1",[client])).rowCount;if(!exists)throw assignmentError('client_unavailable','Client unavailable.',404);
 if(!await deliveryReady())return {setupReady:false,connection:{configured:false,connected:false},releases:[],journey:null};
 const connection=await documentConnectionStatus(actor.admin.id);
 const releases=(await db.query(`SELECT r.id,r.title,r.category,r.journey_stage AS stage,r.drive_version AS version,r.published_at AS "publishedAt",
 (a.id IS NOT NULL AND a.archived_at IS NULL AND a.revision=r.assignment_revision AND c.generation=r.connection_generation AND c.config_hash=$2 AND p.is_active) AS available
 FROM portal_document_releases r LEFT JOIN portal_client_document_assignments a ON a.id=r.assignment_id LEFT JOIN portal_document_connections c ON c.owner_id=r.owner_id LEFT JOIN portal_admins p ON p.user_id=r.owner_id WHERE r.client_id=$1 AND r.revoked_at IS NULL ORDER BY r.published_at DESC LIMIT 100`,[client,connection.configured?documentConfig().hash:null])).rows;
 const journey=journeyRecord((await db.query("SELECT * FROM portal_client_journey WHERE client_id=$1",[client])).rows[0]);
 const history=(await db.query(`SELECT a.action,a.reason,a.occurred_at AS "occurredAt",u.display_name AS "actorName" FROM portal_document_delivery_audit a JOIN portal_users u ON u.id=a.actor_id WHERE a.client_id=$1 ORDER BY a.id DESC LIMIT 30`,[client])).rows;
 return {setupReady:true,connection,releases,journey,history};
}
export async function reviewDocumentReference(headers,client,id,signal){
 const actor=await documentAdmin(headers),a=await assignment(assignmentId(id),clientId(client)),drive=await openDocumentDrive(actor.admin.id);
 const result=await drive.list(a,signal),files=Array.isArray(result)?result:result.files;
 await documentAdmin(headers);const current=await assignment(a.id,client);
 if(String(current.revision)!==String(a.revision))throw assignmentError('reference_changed','The client reference changed. Review again.',409);
 return {assignmentId:a.id,assignmentRevision:String(a.revision),truncated:!!result.truncated,files:files.map(f=>({id:f.id,name:f.name,version:String(f.version),modifiedTime:f.modifiedTime}))};
}
export async function changeDocumentDelivery(request){
 assertTrustedOrigin(request.headers);const actor=await documentAdmin(request.headers),c=deliveryCommand(await readJsonRequest(request,12000));
 if(request.headers.has('x-aoc-document-client')&&request.headers.get('x-aoc-document-client')!==c.clientId)throw assignmentError('client_changed','Selected client changed. Reload before saving.',409);
 const digest=createHash('sha256').update(JSON.stringify(c)).digest('hex');
 // Retry detection precedes provider calls, but still requires current administrator authority.
 const previous=(await db.query('SELECT * FROM portal_document_delivery_audit WHERE operation=$1',[c.operation])).rows[0];
 const replay=r=>{if(r.digest!==digest||String(r.actor_id)!==actor.admin.id||String(r.client_id)!==c.clientId)throw assignmentError('request_changed','Create a new request after changing its details.',409);return r.result;};
 let snapshot,drive,file;
 if(!previous&&c.action==='publish'){
  snapshot=await assignment(c.assignmentId,c.clientId);
  if(String(snapshot.revision)!==c.assignmentRevision)throw assignmentError('reference_changed','The client reference changed. Review again.',409);
  drive=await openDocumentDrive(actor.admin.id);file=await drive.file(snapshot,c.driveId,request.signal);
  if(String(file.version)!==c.driveVersion)throw assignmentError('document_changed','The file changed. Review its current version before publishing.',409);
 }
 return adminDocumentTransaction(actor,c.clientId,async d=>{
  const prior=(await d.query('SELECT * FROM portal_document_delivery_audit WHERE operation=$1',[c.operation])).rows[0];if(prior)return replay(prior);
  let result;
  if(c.action==='publish'){
   const a=await assignment(c.assignmentId,c.clientId,d,true);
   if(String(a.revision)!==c.assignmentRevision||!file)throw assignmentError('reference_changed','Review this file again.',409);
   const valid=(await d.query('SELECT 1 FROM portal_document_connections WHERE owner_id=$1 AND generation=$2 AND config_hash=$3 FOR SHARE',[actor.admin.id,drive.generation,drive.hash])).rowCount;
   if(!valid)throw assignmentError('connection_changed','Google connection changed. Review and approve again.',409);
   const old=(await d.query('SELECT * FROM portal_document_releases WHERE drive_id=$1 AND revoked_at IS NULL FOR UPDATE',[c.driveId])).rows[0];
   if(old&&String(old.client_id)!==c.clientId)throw assignmentError('release_conflict','This file cannot be released for this client.',409);
   if(old)await d.query('UPDATE portal_document_releases SET revoked_at=now() WHERE id=$1',[old.id]);
   const id=randomUUID();await d.query(`INSERT INTO portal_document_releases(id,client_id,assignment_id,assignment_revision,connection_generation,owner_id,drive_id,drive_version,modified_time,mime_type,source_name,title,category,journey_stage)
   VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,[id,c.clientId,a.id,a.revision,drive.generation,actor.admin.id,c.driveId,String(file.version),file.modifiedTime,file.mimeType,file.name,c.title,c.category,c.stage]);result={saved:true,id};
  }else if(c.action==='revoke'){
   const changed=await d.query('UPDATE portal_document_releases SET revoked_at=now() WHERE id=$1 AND client_id=$2 AND revoked_at IS NULL RETURNING id',[c.id,c.clientId]);
   if(!changed.rowCount)throw assignmentError('release_unavailable','Published document unavailable for this client.',404);result={saved:true};
  }else{
   const current=(await d.query('SELECT revision FROM portal_client_journey WHERE client_id=$1 FOR UPDATE',[c.clientId])).rows[0];
   if(String(current?.revision||0)!==c.revision)throw assignmentError('journey_changed','Journey progress changed. Refresh before editing.',409);
   await d.query(`INSERT INTO portal_client_journey(client_id,revision,current_stage,completed,stage_labels,next_action,evidence_type,evidence_summary,updated_by)
    VALUES($1,1,$2,$3,$4::jsonb,$5,$6,$7,$8) ON CONFLICT(client_id) DO UPDATE SET revision=portal_client_journey.revision+1,current_stage=EXCLUDED.current_stage,completed=EXCLUDED.completed,stage_labels=EXCLUDED.stage_labels,next_action=EXCLUDED.next_action,evidence_type=EXCLUDED.evidence_type,evidence_summary=EXCLUDED.evidence_summary,updated_by=EXCLUDED.updated_by,updated_at=now()`,[c.clientId,c.currentStage,c.completed,JSON.stringify(c.stageLabels),c.nextAction,c.evidenceType,c.evidenceSummary,actor.admin.id]);result={saved:true};
  }
  await d.query('INSERT INTO portal_document_delivery_audit(client_id,actor_id,operation,digest,action,reason,result) VALUES($1,$2,$3,$4,$5,$6,$7::jsonb)',[c.clientId,actor.admin.id,c.operation,digest,c.action,c.reason,JSON.stringify(result)]);return result;
 });
}
const eligible=`FROM portal_document_releases r JOIN portal_client_document_assignments a ON a.id=r.assignment_id AND a.client_id=r.client_id AND a.revision=r.assignment_revision AND a.archived_at IS NULL
 JOIN portal_document_connections c ON c.owner_id=r.owner_id AND c.generation=r.connection_generation JOIN portal_admins p ON p.user_id=r.owner_id AND p.is_active
 WHERE r.client_id=$1 AND r.revoked_at IS NULL AND NOT EXISTS(SELECT 1 FROM portal_internal_users i WHERE i.user_id=r.owner_id)`;
export async function clientDocumentList(headers,id,page=0,filters={}){
 if(!Number.isInteger(page)||page<0||page>10000)throw assignmentError("invalid_page","Choose a valid document page.");
 const c=await documentClient(headers,clientId(id)),selected=clientDocumentFilters(filters);if(!await deliveryReady())return {page,hasMore:false,filters:selected,items:[],journey:null};
 let hash;try{hash=documentConfig().hash;}catch{/* Protected downloads need a connection; approved links remain available. */}
 const rows=(await db.query(`WITH visible AS (
 SELECT r.id,r.title,r.category,r.journey_stage,r.drive_version,r.published_at,r.mime_type,'protected'::text AS delivery,NULL::text AS link_revision,COALESCE((${assignmentMetadata}),'') AS description,NULL::text AS source_url ${eligible} AND c.config_hash=$2
 UNION ALL
 SELECT a.id,a.title,publication.category,a.journey_stage,NULL::text,publication.published_at,NULL::text,'link'::text,a.revision::text,COALESCE(publication.description,''),a.source_url ${publishedLinks}
 ) SELECT * FROM visible
 WHERE ($3::text='' OR title ILIKE $3 ESCAPE '\\')
 AND ($4::text='' OR category=$4)
 AND ($5::smallint[] IS NULL OR journey_stage=ANY($5::smallint[]))
 ORDER BY published_at DESC,id DESC LIMIT 51 OFFSET $6`,[c.client.id,hash||null,documentSearchPattern(selected.search),selected.category,selected.step?internalStagesForClientStep(Number(selected.step)):null,page*50])).rows;
 const journey=journeyRecord((await db.query('SELECT * FROM portal_client_journey WHERE client_id=$1',[c.client.id])).rows[0]);
 return {page,hasMore:rows.length>50,filters:selected,items:rows.slice(0,50).map(r=>({id:r.id,title:r.title,description:r.description||"",category:r.category,stage:r.journey_stage,clientStep:clientStepForStage(r.journey_stage),version:r.drive_version,publishedAt:r.published_at,delivery:r.delivery,viewLabel:documentOpenLabel({delivery:r.delivery,mimeType:r.mime_type,sourceUrl:r.source_url,filename:r.title}),canView:r.delivery==="link"||checkDocumentFormat(r.mime_type),viewUrl:`/api/client-documents/${r.id}?clientId=${c.client.id}&mode=view${r.delivery==="link"?"&source=link&revision="+r.link_revision:""}`,downloadUrl:r.delivery==="link"?null:`/api/client-documents/${r.id}?clientId=${c.client.id}&mode=download`})),journey};
}
import {documentFormat} from './document-delivery-policy.js';
function checkDocumentFormat(mime){try{return documentFormat(mime).inline;}catch{return false;}}
export async function deliverClientDocument(request,id){
 const url=new URL(request.url),client=clientId(url.searchParams.get('clientId')),mode=url.searchParams.get('mode')||'download';if(!['view','download'].includes(mode))throw assignmentError('invalid_mode','Choose view or download.');
 await documentClient(request.headers,client);assignmentId(id);
 if(url.searchParams.get('source')==='link'){
  if(mode!=='view')throw assignmentError('invalid_mode','Open the file in Google Drive and use its download option if allowed.');
  return openPublishedDocumentLink(request,id,client,url.searchParams.get('revision'),documentHeaders);
 }
 const release=(await db.query(`SELECT r.*,a.kind,a.drive_id AS assignment_drive_id ${eligible} AND r.id=$2 AND c.config_hash=$3`,[client,id,documentConfig().hash])).rows[0];
 if(!release)throw assignmentError('document_unavailable','Document unavailable in this client workspace.',404);
 const signal=AbortSignal.any([request.signal,AbortSignal.timeout(45000)]);
 const drive=await openDocumentDrive(release.owner_id,release.connection_generation),a={kind:release.kind,drive_id:release.assignment_drive_id};
 const before=await drive.file(a,release.drive_id,signal);verifyReleasedFile(before,release);const format=checkDocument(before),data=await drive.bytes(before,format,signal);
 const after=await drive.file(a,release.drive_id,signal);verifyReleasedFile(after,release);
 // No bytes leave the server until post-provider membership/release/connection checks pass.
 await documentClient(request.headers,client);
 const still=(await db.query(`SELECT r.id ${eligible} AND r.id=$2 AND c.config_hash=$3`,[client,id,documentConfig().hash])).rowCount;
 if(!still)throw assignmentError('document_unavailable','Document access changed. Reload your library.',404);
 return new Response(data,{headers:{...documentHeaders,'Content-Type':format.mime,'Content-Length':String(data.length),'Content-Disposition':`${mode==='view'&&format.inline?'inline':'attachment'}; filename="${documentFilename(release.title,format)}"`,
 'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'self'",'Cross-Origin-Resource-Policy':'same-origin'}});
}
