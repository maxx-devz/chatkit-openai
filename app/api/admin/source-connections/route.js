import { cookies } from "next/headers";
import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";
import { DriveSourceError } from "@/lib/drive-source-policy";
import { driveConnectionStatus, beginDriveConnection, discoverConnectedSources, previewConnectedSource, disconnectDriveSource } from "@/lib/drive-source-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" };

function failure(error) {
  if (error?.publicDetails) return adminErrorResponse(error);
  const security = requestSecurityErrorResponse(error);
  if (security) return security;
  if (error instanceof DriveSourceError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
  return Response.json({ error: error?.code === "42P01" ? "Run npm run sources:migrate before connecting Google Drive."
    : "The Google read-only connection could not finish. Check server configuration or reconnect. No content was published." }, { status: 503, headers });
}

export async function GET(request) {
  try {
    const { admin } = await resolveAdminContext(request.headers);
    return Response.json(await driveConnectionStatus(admin.id), { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const { admin, session } = await resolveAdminContext(request.headers);
    const body = await readJsonRequest(request, 2000);
    if (body.action === "connect") {
      const connection = await beginDriveConnection(admin.id, session);
      (await cookies()).set("aoc_drive_oauth_state", connection.state, {
        httpOnly: true, sameSite: "lax", secure: connection.secure,
        path: "/api/admin/source-connections/callback", maxAge: 600,
      });
      return Response.json({ authorizationUrl: connection.url }, { headers });
    }
    if (body.action === "discover") return Response.json(await discoverConnectedSources(admin.id, { signal: request.signal }), { headers });
    if (body.action === "preview") return Response.json(await previewConnectedSource(admin.id, body.fileId, { signal: request.signal }), { headers });
    if (body.action === "disconnect") return Response.json(await disconnectDriveSource(admin.id), { headers });
    return Response.json({ error: "Choose a supported source connection action." }, { status: 400, headers });
  } catch (error) { return failure(error); }
}
