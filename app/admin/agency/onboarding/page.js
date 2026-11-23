import {headers} from "next/headers";
import {redirect,notFound} from "next/navigation";
import {onboardingAdministration} from "@/lib/delivery-onboarding";
import OnboardingConsole from "@/components/agency/onboarding-console";
import AccessDenied from "@/components/platform/access-denied";
export const dynamic="force-dynamic";
export default async function Page({searchParams}){const p=await searchParams;let data;try{data=await onboardingAdministration(await headers(),p?.agency);}catch(e){if(e.publicDetails?.status===401)redirect("/login");if(e.publicDetails?.status===404)notFound();return <AccessDenied title="Agency approval access required"/>;}return <OnboardingConsole key={data.agency.id} initialData={data}/>;}
