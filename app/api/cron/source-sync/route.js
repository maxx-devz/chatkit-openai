import { timingSafeEqual } from "node:crypto";
import { synchronizeAllPreparedSources } from "@/lib/prepared-source-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request) {
  const secret = process.env.SOURCE_SYNC_SECRET || process.env.CRON_SECRET || "";
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from("Bearer " + secret);
  if (secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }
  try {
    const result = await synchronizeAllPreparedSources({ signal: AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]) });
    return Response.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "Source synchronization failed. Review Source connections." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
