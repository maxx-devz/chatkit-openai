import {
  loadPortalAiAccess,
  portalErrorResponse,
} from "@/lib/portal-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json(
      { ai: { ...await loadPortalAiAccess(request.headers),
        uploadsEnabled: (process.env.CHATKIT_UPLOADS_ENABLED || "true").toLowerCase() === "true" } },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return portalErrorResponse(error);
  }
}
