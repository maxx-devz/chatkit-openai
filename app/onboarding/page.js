import {headers} from "next/headers";
import {redirect,notFound} from "next/navigation";
import {deliveryOnboarding} from "@/lib/delivery-onboarding";
import DeliveryOnboarding from "@/components/agency/delivery-onboarding";
import AccessDenied from "@/components/platform/access-denied";
export const dynamic="force-dynamic";
export default async function Page({searchParams}){const p=await searchParams;let data;try{data=await deliveryOnboarding(await headers(),p?.run);}catch(e){if(e.publicDetails?.status===401)redirect("/login");if(e.publicDetails?.status===404)notFound();return <AccessDenied title="Active delivery onboarding required"/>;}return <DeliveryOnboarding key={data.selected||"choices"} initialData={data}/>;}
