import 'server-only';
import { auth, isPortalAuthConfigured } from './auth.js';
import { employeeDatabase } from './employee-access.js';
import { EmployeeError } from './employee-errors.js';
import { findEmployee, requireActiveEmployee, claimEmployeeRequest, encryptEmployeeToken,
  decryptEmployeeToken, saveEmployeeConnection, finishEmployeeSync } from './employee-repository.js';
import { createEmployeeHubstaff } from './employee-hubstaff.js';

export async function resolveEmployeeContext(requestHeaders) {
  if (!isPortalAuthConfigured()) throw new EmployeeError('employee_unavailable', 'Portal login needs administrator setup.');
  let session;
  try { session = await auth.api.getSession({ headers: requestHeaders }); }
  catch { throw new EmployeeError('employee_unavailable', 'Your session could not be verified. Please try again.'); }
  if (!session?.user?.id) throw new EmployeeError('authentication_required', 'Sign in to access your work dashboard.', 401);
  const employee = requireActiveEmployee(await findEmployee(employeeDatabase(), session.user.id));
  return { employee, profile: { name: employee.display_name || session.user.name || 'Employee',
    connected: Boolean(employee.encrypted_access_token) } };
}

export async function loadEmployeeDashboard(requestHeaders) {
  const { employee } = await resolveEmployeeContext(requestHeaders);
  if (!employee.encrypted_access_token) return { tasks: [], projects: [], connection: { connected: false }, syncedAt: null };
  const db = employeeDatabase();
  await claimEmployeeRequest(db, employee);
  const token = decryptEmployeeToken(employee, process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY);
  const result = await createEmployeeHubstaff().dashboard(token, employee.hubstaff_user_id);
  const syncedAt = await finishEmployeeSync(db, employee);
  return { ...result, syncedAt };
}

export async function connectEmployeeHubstaff(requestHeaders, token) {
  const { employee } = await resolveEmployeeContext(requestHeaders);
  const db = employeeDatabase();
  await claimEmployeeRequest(db, employee, { connecting: true });
  const encrypted = encryptEmployeeToken(token, employee, process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY);
  // Verify both current identity and Tasks read access before replacing any stored token.
  await createEmployeeHubstaff().dashboard(token, employee.hubstaff_user_id);
  await saveEmployeeConnection(db, employee, encrypted);
}
