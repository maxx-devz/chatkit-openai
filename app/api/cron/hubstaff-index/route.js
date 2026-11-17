import { timingSafeEqual } from "node:crypto";
import { synchronizeAllHubstaffSearch } from "@/lib/hubstaff-search-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export async function GET(request) {
  const supplied = Buffer.from(request.headers.get("authorization") || "");
  const headers = {"Cache-Control":"no-store"};
  // External schedulers and native Vercel Cron may use separate rotating secrets.
  const authorized = [process.env.HUBSTAFF_INDEX_SYNC_SECRET,process.env.CRON_SECRET].some(secret => {
    if (!secret || secret.length<32) return false;
    const expected = Buffer.from("Bearer " + secret);
    return supplied.length===expected.length && timingSafeEqual(supplied,expected);
  });
  if (!authorized) {
    return Response.json({error:"Unauthorized"},{status:401,headers});
  }
  try {
    const result = await synchronizeAllHubstaffSearch({
      signal:AbortSignal.any([request.signal,AbortSignal.timeout(20_000)]),
      budgetMs:18_000,clientBudgetMs:10_000,maxClients:3,
    });
    const retry = result.results.some(item => item.code==="rate_limited" || item.code==="sync_failed" || item.code==="access_denied");
    // Only safe batch counts/codes; no task content, credentials or project URLs.
    return Response.json({...result,retryAfterSeconds:60},{status:retry ? 503 : 200,
      headers:{...headers,...(retry ? {"Retry-After":"60"} : {})}});
  } catch { return Response.json({error:"Index batch interrupted; resume on the next run."},{status:503,headers}); }
}
