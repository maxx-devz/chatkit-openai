import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { aocDelivery } from "@/lib/platform-console";
import AocDelivery from "@/components/platform/aoc-delivery";
import AccessDenied from "@/components/platform/access-denied";
export const dynamic = "force-dynamic";
export default async function AocDeliveryPage() {
  let data;
  try { data = await aocDelivery(await headers()); }
  catch (error) { if (error.publicDetails?.status === 401) redirect("/login"); return <AccessDenied title="AOC delivery access required" />; }
  return <AocDelivery initialData={data} />;
}
