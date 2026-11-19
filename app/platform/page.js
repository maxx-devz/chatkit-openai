import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { platformDirectory } from "@/lib/platform-console";
import PlatformConsole from "@/components/platform/platform-console";
import AccessDenied from "@/components/platform/access-denied";
export const dynamic = "force-dynamic";
export const metadata = { title: "AOC Platform Console" };
export default async function PlatformPage() {
  let data;
  try { data = await platformDirectory(await headers()); }
  catch (error) {
    if (error.publicDetails?.status === 401) redirect("/login");
    return <AccessDenied setup={["42883", "42P01"].includes(error.code) || error.publicDetails?.status === 503} />;
  }
  return <PlatformConsole initialData={data} />;
}
