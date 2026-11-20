import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAdminContext } from "@/lib/admin-data";
import AdminShell from "@/components/admin/admin-shell";
import ClientDocumentAssignments from "@/components/admin/client-document-assignments";

export const dynamic = "force-dynamic";
export const metadata = { title: "Client document setup | AOC Admin" };
export default async function ClientDocumentsPage({ searchParams }) {
  let context;
  try { context = await resolveAdminContext(await headers()); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");
    return <main style={{padding:"3rem"}}><h1>AOC administrator access required</h1><Link href="/admin">Return to AOC Admin</Link></main>;
  }
  const params = await searchParams;
  return <AdminShell admin={context.admin} active="documents" title="Documents & Journey" description="Approve client documents from Google Drive and record verified journey progress.">
    {params?.google&&<p role="status">{params.google==='connected'?'Google connected. Select a client to review and approve documents.':params.google==='cancelled'?'Google sign-in cancelled. No connection was saved.':'Google sign-in was not completed. Check the approved account and retry.'}</p>}
    <ClientDocumentAssignments/>
  </AdminShell>;
}
