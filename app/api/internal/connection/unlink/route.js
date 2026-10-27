import { resolveInternalUserContext } from '@/lib/internal-user-data';
import { internalUserDatabase } from '@/lib/internal-user-access';
import { canAccessInternalPanel } from '@/lib/internal-panel-access';
import { hasInternalPermission } from '@/lib/internal-permissions';
import { InternalUserError, internalUserErrorResponse } from '@/lib/internal-user-errors';
import { assertInternalUserRequest } from '@/lib/internal-user-http';
import { unlinkInternalUserConnection } from '@/lib/internal-user-repository';
import { assertTrustedOrigin, requestSecurityErrorResponse } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function backToSettings(code) {
  return new Response(null, { status: 303, headers: {
    Location: `/internal/settings?connection=${encodeURIComponent(code)}`,
    'Cache-Control': 'private, no-store',
  } });
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    assertInternalUserRequest(request);
    const { internalUser, profile } = await resolveInternalUserContext(request.headers);
    if (!canAccessInternalPanel(profile, 'hubstaff')
      || !hasInternalPermission(profile, 'hubstaff.connection.manage')) {
      throw new InternalUserError('panel_forbidden', 'Hubstaff connection access is not enabled.', 403);
    }
    await unlinkInternalUserConnection(internalUserDatabase(), internalUser);
    return backToSettings('unlinked');
  } catch (error) {
    const securityResponse = requestSecurityErrorResponse(error);
    if (securityResponse) {
      securityResponse.headers.set('Cache-Control', 'private, no-store');
      return securityResponse;
    }
    if (error instanceof InternalUserError
      && !['authentication_required', 'internal_user_required'].includes(error.publicDetails.code)) {
      return backToSettings(error.publicDetails.code);
    }
    return internalUserErrorResponse(error);
  }
}
