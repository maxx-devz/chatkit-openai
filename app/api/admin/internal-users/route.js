import {
  adminErrorResponse,
  assertTrustedAdminMutation,
  createAdminInternalUser,
  loadAdminInternalUsers,
  updateAdminInternalUser,
} from "@/lib/admin-data";
import { readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json(await loadAdminInternalUsers(request.headers), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return requestSecurityErrorResponse(error) || adminErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    const body = await readJsonRequest(request, 16_000);
    const internalUser = await createAdminInternalUser(body, request.headers);
    return Response.json({ created: true, internalUser }, { status: 201 });
  } catch (error) {
    return requestSecurityErrorResponse(error) || adminErrorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    const body = await readJsonRequest(request, 16_000);
    const internalUser = await updateAdminInternalUser(body, request.headers);
    return Response.json({ saved: true, internalUser });
  } catch (error) {
    return requestSecurityErrorResponse(error) || adminErrorResponse(error);
  }
}
