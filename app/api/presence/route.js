import { portalErrorResponse, touchPortalPresence } from "@/lib/portal-data";
import {
  assertTrustedOrigin,
  requestSecurityErrorResponse,
} from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    return Response.json(await touchPortalPresence(request.headers), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return requestSecurityErrorResponse(error) || portalErrorResponse(error);
  }
}
