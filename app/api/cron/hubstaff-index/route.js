import { timingSafeEqual } from "node:crypto";
import { synchronizeAllHubstaffSearch } from "@/lib/hubstaff-search-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function GET(request) {
  const secret = process.env.HUBSTAFF_INDEX_SYNC_SECRET || process.env.CRON_SECRET || "";
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const expected = Buffer.from("Bearer " + secret);
  const headers = {"Cache-Control":"no-store"};
  if (secret.length < 32 || supplied.length !== expected.length || !timingSafeEqual(supplied,expected)) {
    return Response.json({error:"Unauthorized"},{status:401,headers});
  }
  try {
    const result = await synchronizeAllHubstaffSearch({signal:AbortSignal.any([request.signal,AbortSignal.timeout(100_000)])});
    return Response.json(result,{headers});
  } catch { return Response.json({error:"Index batch interrupted; resume on the next run."},{status:503,headers}); }
}
