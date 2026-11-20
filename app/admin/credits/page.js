import {headers} from "next/headers";
import {redirect} from "next/navigation";
import Link from "next/link";
import {resolveAdminContext} from "@/lib/admin-data";
import AdminShell from "@/components/admin/admin-shell";
import AdminPlans from "@/components/credits/admin-plans";
export const dynamic="force-dynamic";
export const metadata={title:"Client Plans & Credits | AOC Admin"};
export default async function AdminCreditsPage() {
  let context;
  try{context=await resolveAdminContext(await headers());}
  catch(error){
    if(error?.publicDetails?.status===401)redirect("/login");
    return <main><h1>AOC administrator access required</h1><Link href="/">Return to portal</Link></main>;
  }
  return <AdminShell admin={context.admin} active="credits" title="Client Plans & Credits" description="Monthly portal plans, included AI usage and paid credit additions.">
    <AdminPlans/></AdminShell>;
}
