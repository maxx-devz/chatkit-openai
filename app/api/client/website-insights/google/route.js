import { cookies } from "next/headers";
import { requireClientPermission, portalErrorResponse } from "@/lib/portal-data";
import { CLIENT_PERMISSIONS } from "@/lib/client-permissions";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";
import { beginGoogle } from "@/lib/website-insights/google";
import { InsightError, CALLBACK } from "@/lib/website-insights/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const context = await requireClientPermission(request.headers, CLIENT_PERMISSIONS.DOCUMENTS_MANAGE);
    const input = await readJsonRequest(request, 1000);
    const result = await beginGoogle(context, input.site);
    (await cookies()).set("aoc_insights_oauth", result.state, { httpOnly: true, secure: result.secure, sameSite: "lax", path: CALLBACK, maxAge: 600 });
    return Response.json({ url: result.url }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof InsightError) return Response.json({ error: error.message }, { status: error.status });
    return requestSecurityErrorResponse(error) || portalErrorResponse(error);
  }
}
