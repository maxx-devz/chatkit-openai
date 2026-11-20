import {withAdminAudit} from '@/lib/admin-audited-handler';
import {cookies} from "next/headers";
import {documentAdmin} from "@/lib/document-delivery-access";
import {beginDocumentGoogle,disconnectDocumentGoogle} from "@/lib/document-drive";
import {documentResponse,documentFailure} from "@/lib/document-delivery";
import {assertTrustedOrigin,readJsonRequest} from "@/lib/request-security";
import {DOCUMENT_CALLBACK} from "@/lib/document-delivery-policy";
export const runtime="nodejs";export const dynamic="force-dynamic";
async function auditPOST(request){try{assertTrustedOrigin(request.headers);const a=await documentAdmin(request.headers),b=await readJsonRequest(request,500);
 if(Object.keys(b).length!==1||!['connect','disconnect'].includes(b.action))return documentResponse({error:'Choose connect or disconnect.'},400);
 if(b.action==='disconnect'){await disconnectDocumentGoogle(a);return documentResponse({disconnected:true});}
 const r=await beginDocumentGoogle(a);(await cookies()).set('aoc_document_google_state',r.state,{httpOnly:true,secure:r.secure,sameSite:'lax',path:DOCUMENT_CALLBACK,maxAge:600});return documentResponse({url:r.url});
 }catch(e){return documentFailure(e);}}

export const POST=withAdminAudit("admin.client_documents.google",auditPOST);
