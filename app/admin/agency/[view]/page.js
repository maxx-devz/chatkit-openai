import { notFound } from "next/navigation";
import AgencyPage from "@/components/agency/agency-page";
export const dynamic = "force-dynamic";
export default async function AgencyView({ params, searchParams }) {
  const { view } = await params;
  if (!["clients", "staff", "sources", "usage", "audit", "settings"].includes(view)) notFound();
  return <AgencyPage view={view} searchParams={searchParams} />;
}
