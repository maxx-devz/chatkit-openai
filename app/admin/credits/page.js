import {headers} from "next/headers";
import {redirect} from "next/navigation";
import Link from "next/link";
import {resolveAdminContext} from "@/lib/admin-data";
import AdminShell from "@/components/admin/admin-shell";
import AdminCreditPricing from "@/components/credits/admin-credit-pricing";
export const dynamic="force-dynamic";
export const metadata={title:"AI Credit Pricing | AOC Admin"};
export default async function AdminCreditsPage() {
  let context;
  try{context=await resolveAdminContext(await headers());}
  catch(error){
    if(error?.publicDetails?.status===401)redirect("/login");
    return <main><h1>AOC administrator access required</h1><Link href="/">Return to portal</Link></main>;
  }
  return <AdminShell admin={context.admin} active="credits" title="AI Pricing & Credits" description="Current and scheduled reporting prices, plus per-client allowances.">
    <AdminCreditPricing adminId={context.admin.id}/></AdminShell>;
}
