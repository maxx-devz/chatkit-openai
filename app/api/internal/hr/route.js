import { loadInternalHrDashboard } from '@/lib/internal-hr-data';
import { InternalUserError, internalUserErrorResponse } from '@/lib/internal-user-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  try {
    const url = new URL(request.url);
    if ([...url.searchParams.keys()].some(key => !['month', 'refresh'].includes(key))
      || url.searchParams.getAll('month').length > 1
      || url.searchParams.getAll('refresh').length > 1
      || url.searchParams.has('refresh') && url.searchParams.get('refresh') !== '1') {
      throw new InternalUserError('invalid_request', 'Choose a single HR calendar month.', 400);
    }
    const month = url.searchParams.has('month') ? url.searchParams.get('month') : undefined;
    return Response.json(await loadInternalHrDashboard(request.headers, month,
      { force: url.searchParams.get('refresh') === '1' }), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return internalUserErrorResponse(error); }
}
