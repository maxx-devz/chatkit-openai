import {specialistAdministration,changeSpecialistAssignment,platformResponse,platformError,consoleMutation} from "@/lib/specialist-assignments";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request){try{return platformResponse(await specialistAdministration(request.headers,new URL(request.url).searchParams.get("agency")));}catch(error){return platformError(error);}}
export async function POST(request){return consoleMutation(request,(headers,body)=>changeSpecialistAssignment(headers,body,new URL(request.url).searchParams.get("agency")));}
