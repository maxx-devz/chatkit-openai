import {noteAdminAuditError,noteAdminAuditOutcome} from '@/lib/admin-audit-context';
import {withAdminAudit} from '@/lib/admin-audited-handler';
import {cookies} from "next/headers";
import {documentAdmin} from "@/lib/document-delivery-access";
import {finishDocumentGoogle} from "@/lib/document-drive";
import {documentConfig,DOCUMENT_CALLBACK} from "@/lib/document-delivery-policy";
import {documentResponse} from "@/lib/document-delivery";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
async function auditGET(request){
 let c;try{c=documentConfig();}catch{return documentResponse({error:'Private document Google setup needs attention.'},503);}
 const target=new URL('/admin/client-documents',c.origin),store=await cookies(),state=store.get('aoc_document_google_state')?.value;
 store.set('aoc_document_google_state','',{httpOnly:true,secure:c.origin.startsWith('https:'),sameSite:'lax',path:DOCUMENT_CALLBACK,maxAge:0});
 try{const a=await documentAdmin(request.headers),p=new URL(request.url).searchParams;if(p.has('error')){noteAdminAuditOutcome('cancelled','request_cancelled');target.searchParams.set('google','cancelled');}else{await finishDocumentGoogle(a,p.get('state'),state,p.get('code'));target.searchParams.set('google','connected');}}
 catch(error){noteAdminAuditError(error);noteAdminAuditOutcome('failed');target.searchParams.set('google','failed');}
 return new Response(null,{status:303,headers:{Location:target.href,'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'}});
}

export const GET=withAdminAudit("admin.client_documents.google.callback",auditGET);
