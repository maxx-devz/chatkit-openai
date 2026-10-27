import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { resolveAdminContext } from "@/lib/admin-data";
import AdminSidebar from "@/components/admin/admin-sidebar";
import HubstaffSearchSettings from "@/components/admin/hubstaff-search-settings";
import styles from "@/components/admin/admin-dashboard.module.css";

export const dynamic = "force-dynamic";
export const metadata = {title:"Project search index | AOC Admin"};
export default async function HubstaffIndexPage() {
  let context;
  try { context = await resolveAdminContext(await headers()); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");
    return <main><h1>AOC administrator access required</h1><Link href="/admin">Return to AOC Admin</Link></main>;
  }
  return <div className={styles.shell}><AdminSidebar admin={context.admin} active="hubstaff-index" />
    <HubstaffSearchSettings /></div>;
}
