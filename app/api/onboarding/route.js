import {deliveryOnboarding,updateDeliveryOnboarding,platformResponse,platformError,consoleMutation} from "@/lib/delivery-onboarding";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request){try{return platformResponse(await deliveryOnboarding(request.headers,new URL(request.url).searchParams.get("run")));}catch(error){return platformError(error);}}
export async function POST(request){return consoleMutation(request,updateDeliveryOnboarding);}
