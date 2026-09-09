import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadBuilder } from "@/lib/builder-data";
import AssistantBuilder from "@/components/builder/assistant-builder";
import styles from "@/components/builder/assistant-builder.module.css";
export const dynamic = "force-dynamic";
export const metadata = { title: "AOC Assistant Settings", robots: { index: false, follow: false } };
export default async function BuilderPage() {
  let data;
  try { data = await loadBuilder(await headers()); }
  catch (error) {
    if (error?.publicDetails?.status === 401) redirect("/login");
    const missing = ["42P01", "42703"].includes(error?.code);
    return <main className={styles.unavailable}><h1>{missing ? "Finish builder setup" : "Builder unavailable"}</h1>
      <p>{missing ? "Run npm run builder:migrate against this deployment’s database, then reload this page." : error?.publicDetails?.message || "The builder could not connect. Please try again shortly."}</p>
      <Link href="/admin">Return to administrator portal</Link></main>;
  }
  return <AssistantBuilder initialData={data} />;
}
