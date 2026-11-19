import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAdminContext } from "@/lib/admin-data";
import AdminShell from "@/components/admin/admin-shell";
import ClientDocumentsPrototype from "@/components/portal/client-documents-prototype";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documents & Journey prototype | AOC Admin" };
export default async function ClientDocumentsPage({ searchParams }) {
  let context;
  try { context = await resolveAdminContext(await headers()); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");
    return <main style={{padding:"3rem"}}><h1>AOC administrator access required</h1><Link href="/admin">Return to AOC Admin</Link></main>;
  }
  const params = await searchParams, clientPreview = params?.preview === "client";
  return <AdminShell admin={context.admin} active="documents" title="Documents & Journey" description="First-step layout prototype. No document publication or milestone changes.">
    <p><Link href={clientPreview?"/admin/client-documents":"/admin/client-documents?preview=client"}>{clientPreview?"View planned admin flow":"Preview client layout"}</Link></p>
    <ClientDocumentsPrototype admin={!clientPreview}/>
  </AdminShell>;
}
