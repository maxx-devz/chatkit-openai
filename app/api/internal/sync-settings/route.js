import { loadInternalSyncSettings, updateInternalSyncSetting } from '@/lib/internal-sync-settings';
import { internalUserErrorResponse } from '@/lib/internal-user-errors';
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    return Response.json(await loadInternalSyncSettings(request.headers), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return internalUserErrorResponse(error); }
}

export async function PUT(request) {
  try {
    assertTrustedOrigin(request.headers);
    return Response.json(await updateInternalSyncSetting(request.headers, await readJsonRequest(request, 2000)), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return requestSecurityErrorResponse(error) || internalUserErrorResponse(error); }
}
