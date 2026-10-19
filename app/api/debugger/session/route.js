import { debuggerAccess } from "@/lib/debugger/access";

export const dynamic = "force-dynamic";
export async function GET(request) {
  try {
    const access = await debuggerAccess(request.headers, { reportUnavailable: true });
    return Response.json(access ? { channel: access.channel } : {}, {
      status: access ? 200 : 404, headers: { "Cache-Control": "private, no-store" },
    });
  } catch {
    // A DB/network outage is not evidence that the login changed. Do not wipe
    // the browser's private trace history because a verification request failed.
    return Response.json({}, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  }
}
