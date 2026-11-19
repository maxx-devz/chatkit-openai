import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { supportList } from "@/lib/platform-console";
import SupportRequests from "@/components/platform/support-requests";
import AccessDenied from "@/components/platform/access-denied";
import s from "@/components/platform/console.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "AOC Support Approvals" };
export default async function SupportApprovalsPage() {
  let requests;
  try { requests = await supportList(await headers()); }
  catch (error) { if (error.publicDetails?.status === 401) redirect("/login"); return <AccessDenied title="Support approval access required" />; }
  return <main className={s.card} style={{ maxWidth: 1000, margin: "32px auto" }}><p className={s.links}><Link href="/">Your portal</Link><Link href="/platform">Platform console</Link></p><h1>Support approvals</h1><p>Consent permits only a client-specific portal enabled/disabled check, for at most 30 minutes. It grants no chat, document or impersonation access. Agency and client administrators must approve separately; either may deny.</p><SupportRequests initialRequests={requests} /></main>;
}
