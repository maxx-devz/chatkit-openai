import {
  hubstaffErrorResponse,
  loadHubstaffWorkflowOverview,
} from "@/lib/hubstaff";
import { resolvePortalContext, portalErrorResponse } from "@/lib/portal-data";
import { withDebuggerTrace } from "@/lib/debugger/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  return withDebuggerTrace(request, () => handleGET(request));
}
async function handleGET(request) {
  try {
    const context = await resolvePortalContext(request.headers);
    const data = await loadHubstaffWorkflowOverview(context.client.hubstaffProjectUrl);
    return Response.json(data, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    const code = error?.publicDetails?.code || "";
    return code.startsWith("hubstaff_") || code === "invalid_hubstaff_project_url"
      ? hubstaffErrorResponse(error)
      : portalErrorResponse(error);
  }
}
