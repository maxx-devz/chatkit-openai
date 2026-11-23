import {onboardingAdministration,changeOnboardingAdministration,platformResponse,platformError,onboardingAdminMutation} from "@/lib/delivery-onboarding";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request){try{return platformResponse(await onboardingAdministration(request.headers,new URL(request.url).searchParams.get("agency")));}catch(error){return platformError(error);}}
export async function POST(request){return onboardingAdminMutation(request,(headers,body)=>changeOnboardingAdministration(headers,body,new URL(request.url).searchParams.get("agency")));}
