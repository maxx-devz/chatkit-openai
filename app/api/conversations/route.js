import {
  deletePortalConversation,
  listPortalConversations,
  portalErrorResponse,
  renamePortalConversation,
} from "@/lib/portal-data";
import {
  assertTrustedOrigin,
  readJsonRequest,
  requestSecurityErrorResponse,
} from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStore = { "Cache-Control": "private, no-store" };

function errorResponse(error) {
  const response = requestSecurityErrorResponse(error)
    || portalErrorResponse(error);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function GET(request) {
  try {
    return Response.json(
      { conversations: await listPortalConversations(request.headers) },
      { headers: noStore },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    assertTrustedOrigin(request.headers);
    const input = await readJsonRequest(request, 2_000);
    return Response.json(
      { conversation: await renamePortalConversation(request.headers, input.id, input.title) },
      { headers: noStore },
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request) {
  try {
    assertTrustedOrigin(request.headers);
    const input = await readJsonRequest(request, 1_000);
    await deletePortalConversation(request.headers, input.id);
    return new Response(null, { status: 204, headers: noStore });
  } catch (error) {
    return errorResponse(error);
  }
}
