import { connectInternalUserHubstaff, resolveInternalUserContext } from '@/lib/internal-user-data';
import { InternalUserError, internalUserErrorResponse } from '@/lib/internal-user-errors';
import { assertInternalUserRequest, readInternalUserTokenForm } from '@/lib/internal-user-http';
import { assertTrustedOrigin, requestSecurityErrorResponse } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function backToDashboard(code) {
  return new Response(null, { status: 303, headers: {
    Location: `/internal/settings?connection=${encodeURIComponent(code)}`, 'Cache-Control': 'private, no-store',
  } });
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    await resolveInternalUserContext(request.headers);
    assertInternalUserRequest(request);
    const token = await readInternalUserTokenForm(request);
    await connectInternalUserHubstaff(request.headers, token);
    return backToDashboard('connected');
  } catch (error) {
    const securityResponse = requestSecurityErrorResponse(error);
    if (securityResponse) {
      securityResponse.headers.set('Cache-Control', 'private, no-store');
      return securityResponse;
    }
    if (error instanceof InternalUserError && !['authentication_required', 'internal_user_required'].includes(error.publicDetails.code)) {
      return backToDashboard(error.publicDetails.code);
    }
    return internalUserErrorResponse(error);
  }
}
