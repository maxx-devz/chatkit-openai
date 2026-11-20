import {withAdminAudit} from '@/lib/admin-audited-handler';
import {
  adminErrorResponse,
  assertTrustedAdminMutation,
  resolveAdminContext,
} from "@/lib/admin-data";
import { requestSecurityErrorResponse } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function auditPOST(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    await resolveAdminContext(request.headers);
    return Response.json({error:"Monthly request limits have been removed. Use AI Usage > Clear AI chat usage history."},
      {status:410,headers:{"Cache-Control":"private, no-store"}});
  } catch (error) {
    return requestSecurityErrorResponse(error) || adminErrorResponse(error);
  }
}

export const POST=withAdminAudit("admin.usage",auditPOST);
