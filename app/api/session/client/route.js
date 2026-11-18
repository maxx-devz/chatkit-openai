import { choosePortalWorkspace, portalErrorResponse } from "@/lib/portal-data";
import { ACTIVE_AGENCY_COOKIE, ACTIVE_CLIENT_COOKIE, workspaceError } from "@/lib/workspace-selection";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request) {
  try {
    assertTrustedOrigin(request.headers);
    const body = await readJsonRequest(request, 2000);
    if (typeof body.slug !== "string" || typeof body.agencySlug !== "string") {
      throw workspaceError("invalid_workspace", "Choose an agency and client.", 400);
    }
    const selected = await choosePortalWorkspace(request.headers, { slug: body.slug, agencySlug: body.agencySlug });
    const headers = new Headers({ "Cache-Control": "private, no-store" });
    const secure = new URL(process.env.BETTER_AUTH_URL).protocol === "https:" ? "; Secure" : "";
    for (const [name,value] of [[ACTIVE_AGENCY_COOKIE,selected.agencySlug],[ACTIVE_CLIENT_COOKIE,selected.slug]]) {
      headers.append("Set-Cookie", name + "=" + encodeURIComponent(value) + "; Path=/; HttpOnly; SameSite=Lax" + secure);
    }
    return Response.json({ selected: true, slug: selected.slug, agencySlug: selected.agencySlug }, { headers });
  } catch (error) {
    return requestSecurityErrorResponse(error) || portalErrorResponse(error);
  }
}
