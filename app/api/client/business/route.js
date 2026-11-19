import {readBusiness,saveBusiness} from "@/lib/client-business";
import {platformResponse,platformError} from "@/lib/platform-console";
import {assertTrustedOrigin,readJsonRequest} from "@/lib/request-security";
export const dynamic="force-dynamic";
export async function GET(request){try{return platformResponse(await readBusiness(request.headers));}catch(error){return platformError(error);}}
export async function POST(request){try{assertTrustedOrigin(request.headers);return platformResponse(await saveBusiness(request.headers,await readJsonRequest(request,48000)));}catch(error){return platformError(error);}}
