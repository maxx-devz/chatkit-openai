import { connectEmployeeHubstaff, resolveEmployeeContext } from '@/lib/employee-data';
import { EmployeeError, employeeErrorResponse } from '@/lib/employee-errors';
import { assertEmployeeRequest, readEmployeeTokenForm } from '@/lib/employee-http';
import { assertTrustedOrigin, requestSecurityErrorResponse } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function backToDashboard(code) {
  return new Response(null, { status: 303, headers: {
    Location: `/employee/settings?connection=${encodeURIComponent(code)}`, 'Cache-Control': 'private, no-store',
  } });
}

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    await resolveEmployeeContext(request.headers);
    assertEmployeeRequest(request);
    const token = await readEmployeeTokenForm(request);
    await connectEmployeeHubstaff(request.headers, token);
    return backToDashboard('connected');
  } catch (error) {
    const securityResponse = requestSecurityErrorResponse(error);
    if (securityResponse) {
      securityResponse.headers.set('Cache-Control', 'private, no-store');
      return securityResponse;
    }
    if (error instanceof EmployeeError && !['authentication_required', 'employee_required'].includes(error.publicDetails.code)) {
      return backToDashboard(error.publicDetails.code);
    }
    return employeeErrorResponse(error);
  }
}
