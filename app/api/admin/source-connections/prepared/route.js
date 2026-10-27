import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";
import { preparedSourcesStatus, savePreparedPublication } from "@/lib/prepared-source-store";
import { synchronizePreparedSources } from "@/lib/prepared-source-sync";
import { DriveSourceError } from "@/lib/drive-source-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Referrer-Policy": "no-referrer" };

function failure(error) {
  const known = requestSecurityErrorResponse(error) || (error?.publicDetails ? adminErrorResponse(error) : null);
  if (known) return known;
  if (error instanceof DriveSourceError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers });
  return Response.json({ error: error?.code === "42P01" ? "Run npm run sources:prepare:migrate before preparing sources."
    : "Prepared sources are unavailable. Check the connection and try again.", code: "prepared_sources_unavailable" }, { status: 503, headers });
}

export async function GET(request) {
  try {
    const { admin } = await resolveAdminContext(request.headers);
    return Response.json(await preparedSourcesStatus(admin.id), { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const { admin } = await resolveAdminContext(request.headers);
    const body = await readJsonRequest(request, 16_000);
    if (body.action === "sync") {
      const signal = AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]);
      const result = await synchronizePreparedSources(admin.id, { signal });
      return Response.json({ ...await preparedSourcesStatus(admin.id), result }, { headers });
    }
    if (body.action === "save" || body.action === "disable") return Response.json(await savePreparedPublication(admin.id, body), { headers });
    return Response.json({ error: "Choose synchronize, save or disable." }, { status: 400, headers });
  } catch (error) { return failure(error); }
}
