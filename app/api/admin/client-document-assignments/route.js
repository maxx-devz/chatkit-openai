import {loadDocumentAssignments,saveDocumentAssignment,assignmentResponse,assignmentFailure} from "@/lib/client-document-assignments";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request){try{return assignmentResponse(await loadDocumentAssignments(request.headers,new URL(request.url).searchParams.get("clientId")));}catch(e){return assignmentFailure(e);}}
export async function POST(request){try{return assignmentResponse(await saveDocumentAssignment(request));}catch(e){return assignmentFailure(e);}}
