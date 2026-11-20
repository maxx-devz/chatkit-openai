import {withAdminAudit} from '@/lib/admin-audited-handler';
import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { loadPortalUsage } from "@/lib/portal-usage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function auditGET(request) {
  try {
    await resolveAdminContext(request.headers);
    return Response.json(await loadPortalUsage(), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const response = adminErrorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}

export const GET=withAdminAudit("admin.ai_usage",auditGET);
