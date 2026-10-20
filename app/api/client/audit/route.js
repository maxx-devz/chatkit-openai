import { loadClientAudit } from '@/lib/admin-audit-data';
import { portalErrorResponse } from '@/lib/portal-data';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const params = Object.fromEntries(new URL(request.url).searchParams);
    return Response.json(await loadClientAudit(request.headers, params),
      { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    const response = portalErrorResponse(error);
    response.headers.set('Cache-Control', 'private, no-store');
    return response;
  }
}
