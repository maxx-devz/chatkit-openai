import {withAdminAudit} from '@/lib/admin-audited-handler';
import {loadDocumentAssignments,saveDocumentAssignment,assignmentResponse,assignmentFailure} from "@/lib/client-document-assignments";
export const runtime="nodejs";
export const dynamic="force-dynamic";
async function auditGET(request){try{return assignmentResponse(await loadDocumentAssignments(request.headers,new URL(request.url).searchParams.get("clientId")));}catch(e){return assignmentFailure(e);}}
async function auditPOST(request){try{return assignmentResponse(await saveDocumentAssignment(request));}catch(e){return assignmentFailure(e);}}

export const GET=withAdminAudit("admin.client_document_assignments",auditGET);

export const POST=withAdminAudit("admin.client_document_assignments",auditPOST);
