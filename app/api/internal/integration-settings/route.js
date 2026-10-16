import { loadInternalIntegrationSettings, testInternalHubstaffIntegration } from '@/lib/internal-integration-settings';
import { internalUserErrorResponse } from '@/lib/internal-user-errors';
import { assertInternalUserRequest } from '@/lib/internal-user-http';
import { assertTrustedOrigin, requestSecurityErrorResponse } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const responseOptions = { headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } };

export async function GET(request) {
  try {
    assertInternalUserRequest(request);
    return Response.json(await loadInternalIntegrationSettings(request.headers), responseOptions);
  }
  catch (error) { return internalUserErrorResponse(error); }
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    assertInternalUserRequest(request);
    return Response.json(await testInternalHubstaffIntegration(request.headers), responseOptions);
  } catch (error) { return requestSecurityErrorResponse(error) || internalUserErrorResponse(error); }
}
