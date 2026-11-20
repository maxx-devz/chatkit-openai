import {withAdminAudit} from '@/lib/admin-audited-handler';
import { loadAocAdminAudit } from '@/lib/admin-audit-data';
import { adminErrorResponse } from '@/lib/admin-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function auditGET(request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await loadAocAdminAudit(request.headers, params),
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const response = adminErrorResponse(error);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}

export const GET=withAdminAudit("admin.audit",auditGET);
