import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAdminContext } from "@/lib/admin-data";
import DriveSources from "@/components/admin/drive-sources";

export const dynamic = "force-dynamic";
export const metadata = { title: "Source connections | AOC Admin" };

export default async function SourceConnectionsPage() {
  try { await resolveAdminContext(await headers()); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");
    return <main style={{ padding: "3rem" }}><h1>AOC administrator access required</h1><Link href="/admin">Return to AOC Admin</Link></main>;
  }
  return <DriveSources />;
}
