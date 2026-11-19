import {headers} from "next/headers";
import {redirect,notFound} from "next/navigation";
import {specialistDelivery} from "@/lib/specialist-assignments";
import SpecialistDelivery from "@/components/agency/specialist-delivery";
import AccessDenied from "@/components/platform/access-denied";
export const dynamic="force-dynamic";
export default async function DeliveryPage({searchParams}){const params=await searchParams;let data;try{data=await specialistDelivery(await headers(),params?.assignment);}catch(error){if(error.publicDetails?.status===401)redirect("/login");if(error.publicDetails?.status===404)notFound();return <AccessDenied title="Active specialist assignment required"/>;}return <SpecialistDelivery key={data.selected||"choices"} initialData={data}/>;}
