import 'server-only';
import { auth, isPortalAuthConfigured } from './auth.js';
import { employeeDatabase } from './employee-access.js';
import { EmployeeError } from './employee-errors.js';
import { findEmployee, requireActiveEmployee, claimEmployeeRequest, encryptEmployeeToken,
  assertEmployeeTokenStore, employeeAccessToken, saveEmployeeConnection, finishEmployeeSync } from './employee-repository.js';
import { createEmployeeHubstaff } from './employee-hubstaff.js';
import { employeeHasPanel, employeePanelAccess, employeePosition } from './employee-positions.js';

async function loadEmployeeTeamDirectory(db) {
  const { rows } = await db.query(`SELECT e.user_id, e.position, e.encrypted_access_token IS NOT NULL AS connected,
      u.display_name
    FROM portal_employees e JOIN portal_users u ON u.id=e.user_id
    WHERE e.is_active=TRUE
    ORDER BY u.display_name ASC`);
  return rows.map(row => ({
    id: String(row.user_id),
    name: row.display_name || 'Employee',
    position: employeePosition(row.position).label,
    connected: row.connected === true,
  }));
}

export async function resolveEmployeeContext(requestHeaders) {
  if (!isPortalAuthConfigured()) throw new EmployeeError('employee_unavailable', 'Portal login needs administrator setup.');
  let session;
  try { session = await auth.api.getSession({ headers: requestHeaders }); }
  catch { throw new EmployeeError('employee_unavailable', 'Your session could not be verified. Please try again.'); }
  if (!session?.user?.id) throw new EmployeeError('authentication_required', 'Sign in to access your work dashboard.', 401);
  const employee = requireActiveEmployee(await findEmployee(employeeDatabase(), session.user.id));
  const position = employeePosition(employee.position);
  const panels = employeePanelAccess(employee.panel_access, position.id);
  return { employee, profile: { name: employee.display_name || session.user.name || 'Employee',
    connected: Boolean(employee.encrypted_access_token), position: position.label,
    positionId: position.id, panels } };
}

export async function loadEmployeeDashboard(requestHeaders, { workspace = 'personal' } = {}) {
  const { employee } = await resolveEmployeeContext(requestHeaders);
  const db = employeeDatabase();
  const panels = employeePanelAccess(employee.panel_access, employee.position);
  const personalAccess = panels.some(panel => ['overview', 'my_tasks', 'activity'].includes(panel));
  const teamAccess = panels.some(panel => ['team_directory', 'team_tasks'].includes(panel));
  const settingsAccess = panels.includes('hubstaff');
  if ((workspace === 'personal' && !personalAccess)
    || (workspace === 'team' && !teamAccess)
    || (workspace === 'settings' && !settingsAccess)) {
    throw new EmployeeError('panel_forbidden', 'This employee workspace is not enabled for your account.', 403);
  }
  const teamMembers = workspace === 'team' && employeeHasPanel(employee, 'team_directory')
    ? await loadEmployeeTeamDirectory(db)
    : [];
  const base = {
    tasks: [],
    projects: [],
    connection: { connected: Boolean(employee.encrypted_access_token) },
    syncedAt: employee.last_synced_at ? new Date(employee.last_synced_at).toISOString() : null,
    teamMembers,
    access: {
      position: employeePosition(employee.position).label,
      panels,
      teamTasksAvailable: false,
    },
  };
  const needsPersonalWork = workspace === 'personal' && personalAccess;
  if (!employee.encrypted_access_token || !needsPersonalWork) return base;
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
  return { ...base, ...result, teamMembers, access: base.access, syncedAt };
}

export async function connectEmployeeHubstaff(requestHeaders, token) {
  const { employee } = await resolveEmployeeContext(requestHeaders);
  if (!employeeHasPanel(employee, 'hubstaff')) {
    throw new EmployeeError('panel_forbidden', 'Hubstaff connection access is not enabled for this employee.', 403);
  }
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
