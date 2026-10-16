import { loadPlatformAudit } from '@/lib/platform-audit';
import { internalUserErrorResponse } from '@/lib/internal-user-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const query = new URL(request.url).searchParams;
    return Response.json(await loadPlatformAudit(request.headers, {
      runsPage: query.get('runsPage'), activityPage: query.get('activityPage'), asOf: query.get('asOf'),
    }), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return internalUserErrorResponse(error); }
}
