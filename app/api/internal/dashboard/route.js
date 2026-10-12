import { loadInternalUserDashboard, resolveInternalUserContext } from '@/lib/internal-user-data';
import { internalUserErrorResponse } from '@/lib/internal-user-errors';
import { readInternalUserWorkspace } from '@/lib/internal-user-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  try {
    await resolveInternalUserContext(request.headers);
    const workspace = readInternalUserWorkspace(request);
    return Response.json(await loadInternalUserDashboard(request.headers, { workspace }), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return internalUserErrorResponse(error); }
}
