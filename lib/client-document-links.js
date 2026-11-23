import "server-only";
import {databasePool as db} from "./database.js";
import {assignmentError,parseDriveReference} from "./client-document-assignment-policy.js";
import {documentClient} from "./document-delivery-access.js";

// An explicit publication receipt is valid only for this exact assignment
// revision and client. A save/edit/archive advances the revision and withdraws it.
// Existing result JSONB and append-only audit records avoid a schema migration.
export const linkApproval = `FROM portal_client_document_assignment_audit approval
 JOIN portal_admins publisher ON publisher.user_id=approval.actor_user_id AND publisher.is_active
 WHERE approval.assignment_id=a.id AND approval.client_id=a.client_id
 AND approval.result->>'id'=a.id::text
 AND approval.result->>'revision'=a.revision::text
 AND approval.result->>'status'='published_link'
 AND NOT EXISTS(SELECT 1 FROM portal_internal_users internal WHERE internal.user_id=publisher.user_id)`;
export const assignmentMetadata = `SELECT metadata.result->>'description' AS description
 FROM portal_client_document_assignment_audit metadata
 WHERE metadata.assignment_id=a.id AND metadata.client_id=a.client_id
 AND metadata.result->>'revision'=a.revision::text ORDER BY metadata.id DESC LIMIT 1`;
export const linkPublication = `SELECT approval.result->>'category' AS category,approval.result->>'description' AS description,approval.occurred_at AS published_at
 ${linkApproval} ORDER BY approval.id DESC LIMIT 1`;
export const publishedLinks = `FROM portal_client_document_assignments a
 JOIN LATERAL (${linkPublication}) publication ON true
 WHERE a.client_id=$1 AND a.archived_at IS NULL AND a.kind='document'`;

export async function openPublishedDocumentLink(request,id,client,revision,headers) {
  if(!/^[1-9][0-9]{0,14}$/.test(revision||""))throw assignmentError("document_unavailable","This document link is no longer available. Reload your library.",404);
  const find=()=>db.query(`SELECT a.source_url,a.drive_id,a.kind ${publishedLinks} AND a.id=$2 AND a.revision=$3`,[client,id,revision]);
  const row=(await find()).rows[0];
  if(!row)throw assignmentError("document_unavailable","Document unavailable in this client workspace.",404);
  const source=parseDriveReference(row.source_url);
  if(source.kind!=="document"||source.driveId!==row.drive_id)throw assignmentError("document_unavailable","This document link needs administrator review.",404);
  await documentClient(request.headers,client);
  if(!(await find()).rowCount)throw assignmentError("document_unavailable","Document access changed. Reload your library.",404);
  // Google controls access after redirect. Portal withdrawal cannot recall a
  // copied Google URL or revoke a Google sharing permission.
  return new Response(null,{status:302,headers:{...headers,Location:source.url}});
}
