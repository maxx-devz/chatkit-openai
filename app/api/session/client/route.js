import {
  ACTIVE_CLIENT_COOKIE,
  portalErrorResponse,
  resolvePortalContext,
} from "@/lib/portal-data";
import { readJsonRequest } from "@/lib/request-security";
import { isValidUsername } from "@/lib/input-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(request) {
  let slug;

  try {
    const body = await readJsonRequest(request, 2_000);
    slug = typeof body?.slug === "string" ? body.slug.trim().toLowerCase() : "";
    if (!isValidUsername(slug)) slug = "";
  } catch {
    return Response.json(
      { error: "The client selection is invalid.", code: "invalid_client" },
      { status: 400 },
    );
  }

  try {
    const context = await resolvePortalContext(request.headers);
    const allowed = context.memberships.some(
      (membership) => membership.slug === slug,
    );

    if (!allowed) {
      return Response.json(
        {
          error: "You do not have access to that client account.",
          code: "client_access_denied",
        },
        { status: 403 },
      );
    }

    const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
    return Response.json(
      { selected: true, slug },
      {
        headers: {
          "Cache-Control": "no-store",
          "Set-Cookie": `${ACTIVE_CLIENT_COOKIE}=${encodeURIComponent(slug)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${secure}`,
        },
      },
    );
  } catch (error) {
    return portalErrorResponse(error);
  }
}
