import { loadPortalWorkspace, portalErrorResponse } from "@/lib/portal-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Earlier conversations remain a read-only archive after the ChatKit migration.
export async function GET(request) {
  try {
    return Response.json(await loadPortalWorkspace(request.headers), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
