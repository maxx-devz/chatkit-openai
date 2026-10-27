import { changeOwnInternalPassword, resetInternalUserPassword } from '@/lib/internal-user-passwords';
import { internalUserErrorResponse } from '@/lib/internal-user-errors';
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function errorResponse(error) {
  const response = requestSecurityErrorResponse(error) || internalUserErrorResponse(error);
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const input = await readJsonRequest(request, 1_024);
    return await changeOwnInternalPassword(input, request.headers);
  } catch (error) { return errorResponse(error); }
}

export async function PUT(request) {
  try {
    assertTrustedOrigin(request.headers);
    const input = await readJsonRequest(request, 1_024);
    const result = await resetInternalUserPassword(input, request.headers);
    return Response.json(result, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return errorResponse(error); }
}
