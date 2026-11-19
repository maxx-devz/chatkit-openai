import {headers} from "next/headers";
import {redirect,notFound} from "next/navigation";
import {specialistAdministration} from "@/lib/specialist-assignments";
import SpecialistConsole from "@/components/agency/specialist-console";
import AgencyPage from "@/components/agency/agency-page";
import AccessDenied from "@/components/platform/access-denied";
export const dynamic="force-dynamic";
export default async function SpecialistPage({searchParams}){
 const params=await searchParams;let data;
 try{data=await specialistAdministration(await headers(),params?.agency);}catch(error){if(error.publicDetails?.status===401)redirect("/login");if(error.publicDetails?.status===404)notFound();return <AccessDenied title="Agency approval access required"/>;}
 if(!data.selected)return <AgencyPage searchParams={searchParams}/>;
 return <SpecialistConsole key={data.agency.id} initialData={data}/>;
}
