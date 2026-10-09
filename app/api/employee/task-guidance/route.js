import { analyzeEmployeeGuidance } from '@/lib/employee-data';
import { EmployeeError, employeeErrorResponse } from '@/lib/employee-errors';
import { assertEmployeeRequest } from '@/lib/employee-http';
import { validateGuidanceIds } from '@/lib/employee-task-guidance';
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from '@/lib/request-security';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    assertEmployeeRequest(request);
    const body = await readJsonRequest(request, 1000);
    const taskIds = validateGuidanceIds(body.taskIds);
    if (!taskIds || Object.keys(body).length !== 1) {
      throw new EmployeeError('invalid_request', 'Select up to six assigned tasks for analysis.', 400);
    }
    return Response.json({ guidance: await analyzeEmployeeGuidance(request.headers, taskIds) }, {
      headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' },
    });
  } catch (error) {
    return requestSecurityErrorResponse(error) || employeeErrorResponse(error);
  }
}
