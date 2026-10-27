import { cookies } from "next/headers";
import { resolveAdminContext } from "@/lib/admin-data";
import { driveConfiguration } from "@/lib/drive-source-policy";
import { finishDriveConnection } from "@/lib/drive-source-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request) {
  let config;
  try { config = driveConfiguration(); }
  catch { return Response.json({ error: "Google Drive server configuration is unavailable. Return to AOC Admin and check setup." },
    { status: 503, headers: { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } }); }
  const result = new URL("/admin/sources", config.origin);
  const cookieStore = await cookies();
  const cookieState = cookieStore.get("aoc_drive_oauth_state")?.value;
  cookieStore.set("aoc_drive_oauth_state", "", { path: "/api/admin/source-connections/callback", httpOnly: true,
    secure: config.origin.startsWith("https:"), sameSite: "lax", maxAge: 0 });
  try {
    const { admin, session } = await resolveAdminContext(request.headers);
    const params = new URL(request.url).searchParams;
    if (params.has("error")) {
      result.searchParams.set("connection", "cancelled");
    } else {
      await finishDriveConnection(admin.id, session, params.get("state"), cookieState, params.get("code"));
      result.searchParams.set("connection", "connected");
    }
  } catch (error) {
    // Never echo OAuth codes, tokens, Google payloads, or provider error objects.
    result.searchParams.set("connection", error?.code === "wrong_google_account" ? "wrong_account" : "failed");
  }
  return new Response(null, { status: 303, headers: { Location: result.href, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}
