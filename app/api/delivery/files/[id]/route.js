import {specialistFile,platformError} from "@/lib/specialist-assignments";
import {privateDownloadHeaders} from "@/lib/private-download";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request,{params}){try{const {id}=await params;const file=await specialistFile(request.headers,new URL(request.url).searchParams.get("assignment"),id);return new Response(file.content,{headers:privateDownloadHeaders(file)});}catch(error){return platformError(error);}}
