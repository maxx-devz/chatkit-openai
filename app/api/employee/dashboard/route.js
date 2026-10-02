import { loadEmployeeDashboard, resolveEmployeeContext } from '@/lib/employee-data';
import { employeeErrorResponse } from '@/lib/employee-errors';
import { readEmployeeWorkspace } from '@/lib/employee-http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET(request) {
  try {
    await resolveEmployeeContext(request.headers);
    const workspace = readEmployeeWorkspace(request);
    return Response.json(await loadEmployeeDashboard(request.headers, { workspace }), {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) { return employeeErrorResponse(error); }
}
