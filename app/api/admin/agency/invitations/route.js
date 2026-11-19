import { myAgencyInvitations, acceptAgencyInvitation, platformResponse, platformError, consoleMutation } from "@/lib/agency-administration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try { return platformResponse({ invitations: await myAgencyInvitations(request.headers) }); }
  catch (error) { return platformError(error); }
}
export async function POST(request) { return consoleMutation(request, (headers,body)=>acceptAgencyInvitation(headers,body,new URL(request.url).searchParams.get("brand")||undefined)); }
