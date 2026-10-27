import { loadInternalPmDashboard } from '@/lib/internal-pm-data';
import { InternalUserError, internalUserErrorResponse } from '@/lib/internal-user-errors';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => !['project_id', 'refresh'].includes(key))
      || params.getAll('project_id').length > 1 || params.getAll('refresh').length > 1
      || params.has('refresh') && params.get('refresh') !== '1') {
      throw new InternalUserError('invalid_request', 'Choose one project and refresh option.', 400);
    }
    return Response.json(await loadInternalPmDashboard(request.headers,
      params.has('project_id') ? params.get('project_id') : null,
      { force: params.get('refresh') === '1' }), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return internalUserErrorResponse(error); }
}
