import {specialistDelivery,specialistNote,platformResponse,platformError,consoleMutation} from "@/lib/specialist-assignments";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request){try{return platformResponse(await specialistDelivery(request.headers,new URL(request.url).searchParams.get("assignment")));}catch(error){return platformError(error);}}
export async function POST(request){return consoleMutation(request,specialistNote);}
