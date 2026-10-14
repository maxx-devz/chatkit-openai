import { loadPlatformAudit } from '@/lib/platform-audit';
import { internalUserErrorResponse } from '@/lib/internal-user-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    return Response.json(await loadPlatformAudit(request.headers), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return internalUserErrorResponse(error); }
}
