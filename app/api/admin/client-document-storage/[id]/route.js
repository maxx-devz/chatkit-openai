import {withAdminAudit} from '@/lib/admin-audited-handler';
import {deliverStoredDocument} from '@/lib/client-document-storage';
import {assignmentFailure} from '@/lib/client-document-assignments';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
export const GET=withAdminAudit('admin.client_document_storage.download',async(request,{params})=>{try{return await deliverStoredDocument(request,(await params).id,true);}catch(error){return assignmentFailure(error);}});
