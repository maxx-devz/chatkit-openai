import {withAdminAudit} from '@/lib/admin-audited-handler';
import {deliverUploadedDocument} from '@/lib/client-document-files';
import {assignmentFailure} from '@/lib/client-document-assignments';
export const runtime='nodejs';export const dynamic='force-dynamic';
async function readFile(request,{params}){try{return await deliverUploadedDocument(request,(await params).id,true);}catch(error){return assignmentFailure(error);}}

export const GET=withAdminAudit('admin.client_document_files.download',readFile);
