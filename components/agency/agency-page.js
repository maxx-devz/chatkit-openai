import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { agencyAdministration } from "@/lib/agency-administration";
import AgencyConsole from "./agency-console";
import AccessDenied from "@/components/platform/access-denied";
import s from "@/components/platform/console.module.css";
export default async function AgencyPage({ searchParams, view = "clients" }) {
  const params = await searchParams; let data;
  try { data = await agencyAdministration(await headers(), { agency: typeof params?.agency === "string" ? params.agency : undefined }); }
  catch (error) { if (error.publicDetails?.status === 401) redirect("/login"); if (error.publicDetails?.status === 404) notFound(); return <AccessDenied title="Agency staff access required" />; }
  if (!data.selected) return <main className={s.card} style={{ maxWidth: 720, margin: "40px auto" }}><h1>Choose your agency</h1><p>Open a workspace you are authorized to administer or work in.</p>{data.choices.map(c => <p key={c.id}><Link href={"/admin/agency?" + new URLSearchParams({ agency: c.slug })}>{c.name}</Link></p>)}</main>;
  return <AgencyConsole key={data.workspaceKey} initialData={data} view={view} />;
}
