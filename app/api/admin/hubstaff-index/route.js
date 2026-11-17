import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";
import { adminHubstaffSearchStatus } from "@/lib/hubstaff-search-store";
import { synchronizeHubstaffSearch } from "@/lib/hubstaff-search-sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const headers = {"Cache-Control":"private, no-store"};
function failure(error) {
  if ([401,403,429].includes(error?.publicDetails?.httpStatus)) {
    const limited = error.publicDetails.httpStatus === 429;
    return Response.json({error:limited ? "Hubstaff rate limit reached. Automatic batches will wait before retrying."
      : "Hubstaff access was denied. Check the project's read permissions before resuming.",
    code:limited ? "hubstaff_rate_limited" : "hubstaff_access_denied", retryAfterSeconds:limited ? 60 : null},
    {status:limited ? 429 : 403,headers:{...headers,...(limited ? {"Retry-After":"60"} : {})}});
  }
  return requestSecurityErrorResponse(error) || (error?.publicDetails ? adminErrorResponse(error) : null)
    || Response.json({error:error?.code === "42P01" ? "Run npm run hubstaff:index:migrate first."
      : "Index synchronization could not finish. Check Hubstaff access and try again; the saved cursor is retained."}, {status:503,headers});
}
export async function GET(request) {
  try {
    await resolveAdminContext(request.headers);
    return Response.json(await adminHubstaffSearchStatus(), {headers});
  } catch (error) { return failure(error); }
}
export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    await resolveAdminContext(request.headers);
    const body = await readJsonRequest(request, 1000);
    if (!/^[1-9][0-9]{0,18}$/.test(String(body.clientId))) return Response.json({error:"Choose a client."},{status:400,headers});
    const result = await synchronizeHubstaffSearch(String(body.clientId), {
      signal:AbortSignal.any([request.signal,AbortSignal.timeout(100_000)]),
    });
    return Response.json({...result,completedAt:new Date().toISOString(),retryAfterSeconds:12},{headers});
  } catch (error) { return failure(error); }
}
