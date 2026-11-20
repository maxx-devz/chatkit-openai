import {noteAdminAuditError,noteAdminAuditOutcome} from '@/lib/admin-audit-context';
import {withAdminAudit} from '@/lib/admin-audited-handler';
import { cookies } from "next/headers";
import { resolveAdminContext } from "@/lib/admin-data";
import { driveConfiguration, driveCallbackFailureCode } from "@/lib/drive-source-policy";
import { finishDriveConnection } from "@/lib/drive-source-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

async function auditGET(request) {
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
      noteAdminAuditOutcome("cancelled","request_cancelled");
      result.searchParams.set("connection", "cancelled");
    } else {
      await finishDriveConnection(admin.id, session, params.get("state"), cookieState, params.get("code"));
      result.searchParams.set("connection", "connected");
    }
  } catch (error) {
    noteAdminAuditError(error);noteAdminAuditOutcome("failed");
    // Never echo OAuth codes, tokens, Google payloads, or provider error objects.
    const code = driveCallbackFailureCode(error);
    console.warn("Google Drive callback failed " + JSON.stringify({ code }));
    result.searchParams.set("connection", code === "wrong_google_account" ? "wrong_account"
      : code === "google_client_rejected" ? "client_rejected" : "failed");
  }
  return new Response(null, { status: 303, headers: { Location: result.href, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer" } });
}

export const GET=withAdminAudit("admin.source_connections.callback",auditGET);
