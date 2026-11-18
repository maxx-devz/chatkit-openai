import {headers} from "next/headers";
import {redirect} from "next/navigation";
import Link from "next/link";
import {requireClientPermission} from "@/lib/portal-data";
import ClientPortal from "@/components/portal/client-portal";
import CreditsOverview from "@/components/credits/credits-overview";
export const dynamic="force-dynamic";
export const metadata={title:"AI Credits | AOC Client Portal"};
export default async function CreditsPage() {
  let context;
  try {context=await requireClientPermission(await headers(),"client.overview.read");}
  catch(error) {
    if(error?.publicDetails?.status===401)redirect("/login");
    return <main><h1>Client workspace access required</h1><Link href="/">Return to portal</Link></main>;
  }
  return <ClientPortal portalContext={context} standalonePage="credits">
    <CreditsOverview key={context.client.id} clientId={context.client.id}/>
  </ClientPortal>;
}
