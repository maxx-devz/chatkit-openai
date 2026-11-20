import {clientDocumentList,documentResponse,documentFailure} from "@/lib/document-delivery";
export const runtime="nodejs";export const dynamic="force-dynamic";
export async function GET(request){try{return documentResponse(await clientDocumentList(request.headers,new URL(request.url).searchParams.get('clientId'),Number(new URL(request.url).searchParams.get('page')||0)));}catch(e){return documentFailure(e);}}
