import {noteAdminAuditError,noteAdminAuditSaved} from './admin-audit-context.js';
import {linkPublication,assignmentMetadata} from './client-document-links.js';
import "server-only";
import {createHash,randomUUID} from "node:crypto";
import {databasePool as db} from "./database.js";
import {resolveAdminContext} from "./admin-data.js";
import {assertTrustedOrigin,readJsonRequest} from "./request-security.js";
import {assignmentError,clientId,validateAssignment} from "./client-document-assignment-policy.js";
export const assignmentHeaders={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff"};
function trustedHost(headers){
 let host;try{host=new URL(process.env.BETTER_AUTH_URL).host;}catch{throw assignmentError("setup_required","Portal configuration needs attention.",503);}
 if(headers.get("host")!==host||(headers.has("x-forwarded-host")&&headers.get("x-forwarded-host")!==host))throw assignmentError("untrusted_host","Use the configured portal address.",403);
}
async function context(headers){trustedHost(headers);return resolveAdminContext(headers);}
async function ready(){
 const tables=(await db.query("SELECT to_regclass('portal_client_document_assignments') IS NOT NULL AND to_regclass('portal_client_document_assignment_audit') IS NOT NULL ready")).rows[0].ready;
 return tables;
}
const record=r=>({id:r.id,clientId:String(r.client_id),title:r.title,description:r.description||"",kind:r.kind,url:r.source_url,stage:r.journey_stage,revision:String(r.revision),updatedAt:r.updated_at,status:r.published_at?"published_link":"saved_not_published",category:r.category||null,publishedAt:r.published_at||null});
export function assignmentResponse(data,status=200){return Response.json(data,{status,headers:assignmentHeaders});}
export function assignmentFailure(error){noteAdminAuditError(error);
 const d=error?.publicDetails,code=error?.code;
 const status=d?.status||error?.status||(["42P01","42703"].includes(code)?503:code==="23505"||code==="40001"?409:500);
 const message=d?.message||(status===409?"This reference is already assigned or has changed. Refresh before retrying.":status===503?"Document setup needs the portal owner's attention.":status===403?"You do not have permission to manage client documents.":"Document setup could not be completed. Please try again.");
 return assignmentResponse({error:message,code:d?.code||(status===409?"assignment_conflict":status===503?"setup_required":"request_failed")},status);
}
export async function loadDocumentAssignments(headers,selected){
 await context(headers);
 const clients=(await db.query("SELECT id::text,display_name AS name,slug,portal_enabled AS enabled FROM portal_clients ORDER BY lower(display_name),id")).rows;
 const chosen=selected?clients.find(c=>c.id===clientId(selected)):null;
 if(selected&&!chosen)throw assignmentError("client_unavailable","This client is no longer available. Choose another client.",404);
 const setupReady=await ready();
 if(!chosen||!setupReady)return {clients,client:chosen,setupReady,assignments:[],history:[]};
 const assignments=(await db.query(`SELECT a.*,metadata.description,publication.category,publication.published_at FROM portal_client_document_assignments a LEFT JOIN LATERAL (${assignmentMetadata}) metadata ON true LEFT JOIN LATERAL (${linkPublication}) publication ON a.kind='document' WHERE a.client_id=$1 AND a.archived_at IS NULL ORDER BY a.updated_at DESC,a.id LIMIT 100`,[chosen.id])).rows.map(record);
 const history=(await db.query(`SELECT COALESCE(a.result->>'publicationAction',a.action) AS action,a.reason,a.occurred_at AS "occurredAt",u.display_name AS "actorName"
 FROM portal_client_document_assignment_audit a JOIN portal_users u ON u.id=a.actor_user_id WHERE a.client_id=$1 ORDER BY a.occurred_at DESC,a.id DESC LIMIT 20`,[chosen.id])).rows;
 return {clients,client:chosen,setupReady,assignments,history};
}
export async function saveDocumentAssignment(request){
 assertTrustedOrigin(request.headers);const actor=await context(request.headers),command=validateAssignment(await readJsonRequest(request,6000));
 if(request.headers.has("x-aoc-document-client")&&request.headers.get("x-aoc-document-client")!==command.clientId)throw assignmentError("client_changed","The selected client changed. Reload before saving.",409);
 if(!await ready())throw assignmentError("setup_required","Document setup needs the portal owner's attention.",503);
 const digest=createHash("sha256").update(JSON.stringify(command)).digest("hex"),connection=await db.connect();
 try{
  await connection.query("BEGIN");await connection.query("SET LOCAL lock_timeout='3s'");
  // A stale browser session is not authority. Lock the live account/session for this write.
  const allowed=await connection.query(`SELECT 1 FROM portal_admins a JOIN portal_users u ON u.id=a.user_id JOIN "session" s ON s."userId"=u.external_id
    WHERE a.user_id=$1 AND a.is_active AND s.id=$2 AND s."expiresAt">now() FOR SHARE OF a,u,s`,[actor.admin.id,actor.session.session.id]);
  if(!allowed.rowCount)throw assignmentError("administrator_required","Administrator access changed. Sign in again.",403);
  if((await connection.query("SELECT to_regclass('portal_internal_users') relation")).rows[0].relation){
   if((await connection.query("SELECT 1 FROM portal_internal_users WHERE user_id=$1",[actor.admin.id])).rowCount)throw assignmentError("internal_user_only","Use your Internal Portal account for internal work.",403);
  }
  if(!(await connection.query("SELECT 1 FROM portal_clients WHERE id=$1 FOR SHARE",[command.clientId])).rowCount)throw assignmentError("client_unavailable","The selected client is unavailable.",404);
  await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('client-documents:'||$1,201))",[command.clientId]);
  const prior=(await connection.query("SELECT * FROM portal_client_document_assignment_audit WHERE operation=$1",[command.operation])).rows[0];
  if(prior){
   if(String(prior.actor_user_id)!==actor.admin.id||String(prior.client_id)!==command.clientId||prior.command_digest!==digest)throw assignmentError("request_changed","Create a new request after changing its details.",409);
   await connection.query("COMMIT");return prior.result;
  }
  let existing;
  if(command.id){existing=(await connection.query("SELECT * FROM portal_client_document_assignments WHERE id=$1 AND client_id=$2 AND archived_at IS NULL FOR UPDATE",[command.id,command.clientId])).rows[0];
   if(!existing)throw assignmentError("reference_unavailable","This saved reference is unavailable for the selected client.",404);
   if(String(existing.revision)!==command.revision)throw assignmentError("assignment_changed","Someone updated this reference. Refresh before editing.",409);
  }
  const priorDescription=existing?(await connection.query(`SELECT metadata.description FROM portal_client_document_assignments a LEFT JOIN LATERAL (${assignmentMetadata}) metadata ON true WHERE a.id=$1 AND a.client_id=$2`,[existing.id,command.clientId])).rows[0]?.description||"":"";
  const description=Object.hasOwn(command,"description")?command.description:priorDescription;
  const stage=Object.hasOwn(command,"stage")?command.stage:existing?.journey_stage??null;
  let saved,action;
  if(command.action==="publish"||command.action==="revoke"){
   if(existing.kind!=="document")throw assignmentError("invalid_reference","Publish individual approved file links. Folder references stay private.");
   saved=(await connection.query(`UPDATE portal_client_document_assignments SET journey_stage=COALESCE($3,journey_stage),updated_at=now(),updated_by=$4,revision=revision+1 WHERE id=$1 AND client_id=$2 RETURNING *`,[command.id,command.clientId,command.action==="publish"?command.stage:null,actor.admin.id])).rows[0];action="update";
  }else if(command.action==="archive"){
   saved=(await connection.query("UPDATE portal_client_document_assignments SET archived_at=now(),updated_at=now(),updated_by=$3,revision=revision+1 WHERE id=$1 AND client_id=$2 RETURNING *",[command.id,command.clientId,actor.admin.id])).rows[0];action="archive";
  }else if(existing){
   saved=(await connection.query(`UPDATE portal_client_document_assignments SET title=$3,source_url=$4,drive_id=$5,kind=$6,journey_stage=$7,revision=revision+1,updated_at=now(),updated_by=$8 WHERE id=$1 AND client_id=$2 RETURNING *`,[command.id,command.clientId,command.title,command.url,command.driveId,command.kind,stage,actor.admin.id])).rows[0];action="update";
  }else{
   saved=(await connection.query(`INSERT INTO portal_client_document_assignments(id,client_id,title,source_url,drive_id,kind,journey_stage,created_by,updated_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$8) RETURNING *`,[randomUUID(),command.clientId,command.title,command.url,command.driveId,command.kind,stage,actor.admin.id])).rows[0];action="create";
  }
  const result={saved:true,id:saved.id,revision:String(saved.revision),description,status:command.action==="archive"?"removed":command.action==="publish"?"published_link":"saved_not_published",
   ...(command.action==="publish"?{category:command.category,publicationAction:"publish"}:command.action==="revoke"?{publicationAction:"revoke"}:{})};
  await connection.query(`INSERT INTO portal_client_document_assignment_audit(assignment_id,client_id,actor_user_id,operation,command_digest,action,reason,result) VALUES($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,[saved.id,command.clientId,actor.admin.id,command.operation,digest,action,command.reason,JSON.stringify(result)]);
  await connection.query("COMMIT");noteAdminAuditSaved({clientId:command.clientId,id:saved.id,title:saved.title,stage:saved.journey_stage,status:result.status});return result;
 }catch(e){await connection.query("ROLLBACK");throw e;}finally{connection.release();}
}
