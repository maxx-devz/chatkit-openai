import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { myAgencyInvitations } from "@/lib/agency-administration";
import InvitationInbox from "@/components/agency/invitation-inbox";
import AccessDenied from "@/components/platform/access-denied";
export const dynamic = "force-dynamic";
export default async function AgencyInvitationsPage() {
  let invitations;
  try { invitations = await myAgencyInvitations(await headers()); }
  catch (error) { if (error.publicDetails?.status === 401) redirect("/login"); if (error.publicDetails?.status === 404) notFound(); return <AccessDenied title="Invitation access required" />; }
  return <InvitationInbox initialInvitations={invitations} />;
}
