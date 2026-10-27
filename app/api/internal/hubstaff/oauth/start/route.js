import { resolveInternalUserContext } from '@/lib/internal-user-data';
import { canAccessInternalPanel } from '@/lib/internal-panel-access';
import { hasInternalPermission } from '@/lib/internal-permissions';
import { InternalUserError, internalUserErrorResponse } from '@/lib/internal-user-errors';
import { createInternalHubstaffOAuthAttempt, internalHubstaffOAuthConfig,
  internalHubstaffOAuthCookieHeader } from '@/lib/internal-hubstaff-oauth';
import { assertTrustedOrigin, requestSecurityErrorResponse } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const { internalUser, profile, authSessionId } = await resolveInternalUserContext(request.headers);
    if (!canAccessInternalPanel(profile, 'hubstaff')
      || !hasInternalPermission(profile, 'hubstaff.connection.manage')) {
      throw new InternalUserError('panel_forbidden', 'Hubstaff connection access is not enabled.', 403);
    }
    const config = internalHubstaffOAuthConfig();
    const attempt = createInternalHubstaffOAuthAttempt(config, {
      userId: internalUser.user_id, sessionId: authSessionId,
      hubstaffUserId: internalUser.hubstaff_user_id, connectionVersion: internalUser.connection_version,
    });
    return new Response(null, { status: 303, headers: {
      Location: attempt.authorizeUrl,
      'Set-Cookie': internalHubstaffOAuthCookieHeader(attempt.stateCookie),
      'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
    } });
  } catch (error) {
    const securityResponse = requestSecurityErrorResponse(error);
    if (securityResponse) return securityResponse;
    if (error instanceof InternalUserError
      && !['authentication_required', 'internal_user_required'].includes(error.publicDetails.code)) {
      return new Response(null, { status: 303, headers: {
        Location: `/internal/settings?connection=${encodeURIComponent(error.publicDetails.code)}`,
        'Cache-Control': 'private, no-store',
      } });
    }
    return internalUserErrorResponse(error);
  }
}
