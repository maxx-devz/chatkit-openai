import { cookies } from "next/headers";
import { requireClientPermission } from "@/lib/portal-data";
import { CLIENT_PERMISSIONS } from "@/lib/client-permissions";
import { finishGoogle, cancelGoogle } from "@/lib/website-insights/google";
import { CALLBACK, googleConfig } from "@/lib/website-insights/policy";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request) {
  let config;
  try { config = googleConfig(); }
  catch { return Response.json({ error: "Search Console server configuration needs attention. Return to Website Insights." }, { status: 503 }); }
  const result = new URL("/?view=website-insights", config.origin), params = new URL(request.url).searchParams;
  const jar = await cookies(), state = jar.get("aoc_insights_oauth")?.value;
  jar.set("aoc_insights_oauth", "", { httpOnly: true, secure: config.origin.startsWith("https:"), sameSite: "lax", path: CALLBACK, maxAge: 0 });
  try {
    const context = await requireClientPermission(request.headers, CLIENT_PERMISSIONS.DOCUMENTS_MANAGE);
    if (params.has("error")) {
      result.searchParams.set("site", await cancelGoogle(context, params.get("state"), state));
      result.searchParams.set("connection", params.get("error") === "access_denied" ? "cancelled" : "failed");
    }
    else {
      result.searchParams.set("site", await finishGoogle(context, params.get("state"), state, params.get("code")));
      result.searchParams.set("connection", "authorization_saved");
    }
  } catch { result.searchParams.set("connection", "failed"); }
  return new Response(null, { status: 303, headers: { Location: result.href, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
