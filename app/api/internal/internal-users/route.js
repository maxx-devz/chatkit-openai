import {
  adminErrorResponse,
  createAdminInternalUser,
  loadAdminInternalUsers,
  updateInternalUserRole,
  updateAdminInternalUser,
} from '@/lib/admin-data';
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    return Response.json(await loadAdminInternalUsers(request.headers), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return requestSecurityErrorResponse(error) || adminErrorResponse(error); }
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const internalUser = await createAdminInternalUser(await readJsonRequest(request, 16_000), request.headers);
    return Response.json({ created: true, internalUser }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return requestSecurityErrorResponse(error) || adminErrorResponse(error); }
}

export async function PATCH(request) {
  try {
    assertTrustedOrigin(request.headers);
    const internalUser = await updateAdminInternalUser(await readJsonRequest(request, 16_000), request.headers);
    return Response.json({ saved: true, internalUser }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return requestSecurityErrorResponse(error) || adminErrorResponse(error); }
}

export async function PUT(request) {
  try {
    assertTrustedOrigin(request.headers);
    const internalUser = await updateInternalUserRole(await readJsonRequest(request, 16_000), request.headers);
    return Response.json({ saved: true, internalUser }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) { return requestSecurityErrorResponse(error) || adminErrorResponse(error); }
}
