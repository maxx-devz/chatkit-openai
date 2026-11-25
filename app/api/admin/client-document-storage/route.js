import {withAdminAudit} from '@/lib/admin-audited-handler';
import {saveStoredDocument} from '@/lib/client-document-storage';
import {assignmentResponse,assignmentFailure} from '@/lib/client-document-assignments';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
export const POST=withAdminAudit('admin.client_document_storage',async request=>{try{return assignmentResponse(await saveStoredDocument(request));}catch(error){return assignmentFailure(error);}});
