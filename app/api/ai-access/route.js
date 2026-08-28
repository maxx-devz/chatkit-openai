import {
  loadPortalAiAccess,
  portalErrorResponse,
} from "@/lib/portal-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json(
      { ai: await loadPortalAiAccess(request.headers) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return portalErrorResponse(error);
  }
}
