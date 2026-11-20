import {adminDocumentDelivery,reviewDocumentReference,changeDocumentDelivery,documentResponse,documentFailure} from "@/lib/document-delivery";
export const runtime="nodejs";export const dynamic="force-dynamic";export const maxDuration=60;
export async function GET(request){try{const p=new URL(request.url).searchParams;return documentResponse(p.get('assignmentId')?await reviewDocumentReference(request.headers,p.get('clientId'),p.get('assignmentId'),request.signal):await adminDocumentDelivery(request.headers,p.get('clientId')));}catch(e){return documentFailure(e);}}
export async function POST(request){try{return documentResponse(await changeDocumentDelivery(request));}catch(e){return documentFailure(e);}}
