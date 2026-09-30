import { loadEmployeeDashboard, resolveEmployeeContext } from '@/lib/employee-data';
import { employeeErrorResponse } from '@/lib/employee-errors';
import { assertEmployeeRequest } from '@/lib/employee-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  try {
    await resolveEmployeeContext(request.headers);
    assertEmployeeRequest(request);
    return Response.json(await loadEmployeeDashboard(request.headers), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return employeeErrorResponse(error); }
}
