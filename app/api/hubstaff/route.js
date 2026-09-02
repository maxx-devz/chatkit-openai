import {
  hubstaffErrorResponse,
  loadHubstaffProject,
} from "@/lib/hubstaff";
import { resolvePortalContext, portalErrorResponse } from "@/lib/portal-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const context = await resolvePortalContext(request.headers);
    const data = await loadHubstaffProject(context.client.hubstaffProjectUrl);

    return Response.json(data, {
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    const code = error?.publicDetails?.code || "";
    return code.startsWith("hubstaff_") || code === "invalid_hubstaff_project_url"
      ? hubstaffErrorResponse(error)
      : portalErrorResponse(error);
  }
}
