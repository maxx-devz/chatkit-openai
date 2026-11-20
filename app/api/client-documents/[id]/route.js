import {deliverClientDocument,documentFailure} from "@/lib/document-delivery";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(request,{params}){try{return await deliverClientDocument(request,(await params).id);}catch(e){return documentFailure(e);}}
