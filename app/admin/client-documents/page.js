import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAdminContext } from "@/lib/admin-data";
import AdminShell from "@/components/admin/admin-shell";
import ClientDocumentAssignments from "@/components/admin/client-document-assignments";
import ClientDocumentsPrototype from "@/components/portal/client-documents-prototype";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client document setup | AOC Admin" };
export default async function ClientDocumentsPage({ searchParams }) {
  let context;
  try { context = await resolveAdminContext(await headers()); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");
    return <main style={{padding:"3rem"}}><h1>AOC administrator access required</h1><Link href="/admin">Return to AOC Admin</Link></main>;
  }
  const params = await searchParams, clientPreview = params?.preview === "client";
  return <AdminShell admin={context.admin} active="documents" title="Documents & Journey" description="Assign existing Drive references to a client. Publication and journey verification stay separate.">
    <p><Link href={clientPreview?"/admin/client-documents":"/admin/client-documents?preview=client"}>{clientPreview?"Back to document setup":"Preview client layout"}</Link></p>
    {clientPreview?<ClientDocumentsPrototype/>:<ClientDocumentAssignments/>}
  </AdminShell>;
}
