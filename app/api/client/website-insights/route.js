import { requireClientPermission, portalErrorResponse } from "@/lib/portal-data";
import { assertClientMutation } from "@/lib/client-mutation";
import { CLIENT_PERMISSIONS } from "@/lib/client-permissions";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";
import { InsightError, resourceId } from "@/lib/website-insights/policy";
import { listWebsites, addWebsite, editWebsite, archiveWebsite, reportHistory, getReport, startReport, advanceReport } from "@/lib/website-insights/store";
import { googleStatus, googleProperties, selectGoogleProperty, disconnectGoogle, websiteSearchData } from "@/lib/website-insights/google";
import { reportCsv } from "@/lib/website-insights/presentation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// A PageSpeed device run has a 90-second budget; allow time to save its batch.
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store" };
function failure(error) {
  if (error instanceof InsightError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
  if (["job_paused","job_scope_changed"].includes(error?.code)) return Response.json({ error:error.message,code:error.code },{ status:error.status,headers });
  if (error?.code === "42P01") return Response.json({ error: "Website Insights needs its database setup: run npm run website-insights:migrate.", code: "schema_missing" }, { status: 503, headers });
  const response = requestSecurityErrorResponse(error) || portalErrorResponse(error);
  response.headers.set("Cache-Control", "private, no-store"); return response;
}
export async function GET(request) {
  try {
    const context = await requireClientPermission(request.headers, CLIENT_PERMISSIONS.OVERVIEW_READ);
    const params = new URL(request.url).searchParams, site = params.get("site"), report = params.get("report");
    if (report) {
      const value = await getReport(context, report);
      if (params.get("download") === "csv") return new Response(reportCsv(value.result), { headers: { ...headers,
        "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="website-findings-${resourceId(report)}.csv"`, "X-Content-Type-Options": "nosniff" } });
      if (params.get("download") === "json") return Response.json(value, { headers: { ...headers,
        "Content-Disposition": `attachment; filename="website-report-${resourceId(report)}.json"`, "X-Content-Type-Options": "nosniff" } });
      return Response.json({ report: value }, { headers });
    }
    if (site) return Response.json({ history: await reportHistory(context, site), google: await googleStatus(context, site) }, { headers });
    return Response.json({ websites: await listWebsites(context) }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const context = await requireClientPermission(request.headers, CLIENT_PERMISSIONS.DOCUMENTS_CONTRIBUTE);
    const input = await readJsonRequest(request, 3000);
    assertClientMutation(input);
    if (input.action === "add") return Response.json({ website: await addWebsite(context, input) }, { status: 201, headers });
    if (input.action === "rename") return Response.json({ website: await editWebsite(context, input.site, input) }, { headers });
    if (input.action === "analyze") return Response.json({ report: await getReport(context, await startReport(context, input.site)) }, { headers });
    if (input.action === "advance") return Response.json({ report: await advanceReport(context, resourceId(input.report), websiteSearchData, request.signal, input.retry === true) }, { headers });
    if (["properties", "select-property", "disconnect", "archive"].includes(input.action)) {
      await requireClientPermission(request.headers, CLIENT_PERMISSIONS.DOCUMENTS_MANAGE);
      if (input.action === "properties") return Response.json({ properties: await googleProperties(context, input.site) }, { headers });
      if (input.action === "select-property") await selectGoogleProperty(context, input.site, input.property);
      if (input.action === "disconnect" || input.action === "archive") await disconnectGoogle(context, input.site);
      if (input.action === "archive") await archiveWebsite(context, input.site);
      return Response.json({ ok: true }, { headers });
    }
    throw new InsightError("invalid_action", "Choose a supported Website Insights action.");
  } catch (error) { return failure(error); }
}
