import {
  hubstaffErrorResponse,
  loadHubstaffProject,
} from "@/lib/hubstaff";
import {
  rememberHubstaffTrackingProjectId,
  resolvePortalContext,
  portalErrorResponse,
} from "@/lib/portal-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const context = await resolvePortalContext(request.headers);
    const data = await loadHubstaffProject(context.client.hubstaffProjectUrl, {
      monthlyHoursLimit: context.client.hubstaffMonthlyHoursLimit,
      includeTasks: false,
      trackingProjectId: context.client.hubstaffTrackingProjectId,
    });

    if (
      data?.project?.trackingProjectId
      && data.project.trackingProjectId !== context.client.hubstaffTrackingProjectId
    ) {
      await rememberHubstaffTrackingProjectId(
        context.client.id,
        context.client.hubstaffProjectUrl,
        data.project.trackingProjectId,
      ).catch((error) => {
        console.warn("Hubstaff v2 project mapping could not be persisted", {
          code: error?.code || error?.publicDetails?.code || "database_error",
        });
      });
    }

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
