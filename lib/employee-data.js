import 'server-only';
import { auth, isPortalAuthConfigured } from './auth.js';
import { employeeDatabase } from './employee-access.js';
import { EmployeeError } from './employee-errors.js';
import { findEmployee, requireActiveEmployee, claimEmployeeRequest, encryptEmployeeToken,
  assertEmployeeTokenStore, employeeAccessToken, saveEmployeeConnection, finishEmployeeSync } from './employee-repository.js';
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
  const hubstaff = createEmployeeHubstaff();
  const token = await employeeAccessToken(db, employee, process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY,
    refreshToken => hubstaff.exchange(refreshToken));
  let result;
  try {
    result = await hubstaff.dashboard(token, employee.hubstaff_user_id);
  } catch (error) {
    if (error?.publicDetails?.code !== 'invalid_token' || !employee.encrypted_refresh_token) throw error;
    // One 401-triggered renewal; never loop on a rejected or scope-limited token.
    const renewed = await employeeAccessToken(db, employee, process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY,
      refreshToken => hubstaff.exchange(refreshToken), token);
    result = await hubstaff.dashboard(renewed, employee.hubstaff_user_id);
  }
  const syncedAt = await finishEmployeeSync(db, employee);
  return { ...result, syncedAt };
}

export async function connectEmployeeHubstaff(requestHeaders, token) {
  const { employee } = await resolveEmployeeContext(requestHeaders);
  const db = employeeDatabase();
  await claimEmployeeRequest(db, employee, { connecting: true });
  await assertEmployeeTokenStore(db, employee);
  const hubstaff = createEmployeeHubstaff();
  const exchanged = await hubstaff.exchange(token);
  // Verify both current identity and Tasks read access before replacing any stored token.
  await hubstaff.dashboard(exchanged.accessToken, employee.hubstaff_user_id);
  const secret = process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY;
  await saveEmployeeConnection(db, employee,
    encryptEmployeeToken(exchanged.accessToken, employee, secret),
    encryptEmployeeToken(exchanged.refreshToken, employee, secret), exchanged.expiresAt);
}
