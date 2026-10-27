import { createClientMember, listClientAccessAudit, listClientMembers, updateClientMember } from "@/lib/client-members";
import { portalErrorResponse } from "@/lib/portal-data";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

function errorResponse(error) {
  const response = requestSecurityErrorResponse(error) || portalErrorResponse(error);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if (url.searchParams.get("view") === "audit") {
      return Response.json(await listClientAccessAudit(request.headers, url.searchParams.get("before") || ""),
        { headers: noStore });
    }
    return Response.json(await listClientMembers(request.headers), { headers: noStore });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const input = await readJsonRequest(request, 2_000);
    return Response.json({ member: await createClientMember(request.headers, input) },
      { status: 201, headers: noStore });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request) {
  try {
    assertTrustedOrigin(request.headers);
    const input = await readJsonRequest(request, 1_000);
    return Response.json({ member: await updateClientMember(request.headers, input) }, { headers: noStore });
  } catch (error) { return errorResponse(error); }
}
