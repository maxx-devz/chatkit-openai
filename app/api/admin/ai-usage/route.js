import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { loadPortalUsage } from "@/lib/portal-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    await resolveAdminContext(request.headers);
    return Response.json(await loadPortalUsage(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = adminErrorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
