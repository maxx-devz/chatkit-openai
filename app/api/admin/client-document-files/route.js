import {withAdminAudit} from '@/lib/admin-audited-handler';
import {saveDocumentFile} from '@/lib/client-document-files';
import {assignmentResponse,assignmentFailure} from '@/lib/client-document-assignments';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=60;
export const POST=withAdminAudit('admin.client_document_files',async request=>{try{return assignmentResponse(await saveDocumentFile(request));}catch(error){return assignmentFailure(error);}});
