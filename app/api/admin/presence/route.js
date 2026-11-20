import {withAdminAudit} from '@/lib/admin-audited-handler';
import { adminErrorResponse, loadAdminPresence } from "@/lib/admin-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function auditGET(request) {
  try {
    return Response.json(
      { clients: await loadAdminPresence(request.headers) },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export const GET=withAdminAudit("admin.presence",auditGET);
