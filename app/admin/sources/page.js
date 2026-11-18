import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAdminContext } from "@/lib/admin-data";
import DriveSources from "@/components/admin/drive-sources";
import AdminShell from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";
export const metadata = { title: "Source connections | AOC Admin" };

export default async function SourceConnectionsPage() {
  let context;
  try { context=await resolveAdminContext(await headers()); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");
    return <main style={{ padding: "3rem" }}><h1>AOC administrator access required</h1><Link href="/admin">Return to AOC Admin</Link></main>;
  }
  return <AdminShell admin={context.admin} active="sources" title="Source Connections" description="Read-only Drive authorization and prepared company knowledge."><DriveSources embedded/></AdminShell>;
}
