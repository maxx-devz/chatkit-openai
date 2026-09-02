import {
  adminErrorResponse,
  assertTrustedAdminMutation,
  resetAdminClientUsage,
} from "@/lib/admin-data";
import { readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    const body = await readJsonRequest(request, 4_000);
    const client = await resetAdminClientUsage(body?.slug, request.headers);
    return Response.json({ reset: true, client });
  } catch (error) {
    return requestSecurityErrorResponse(error) || adminErrorResponse(error);
  }
}
