import 'server-only';
import { auth, isPortalAuthConfigured } from './auth.js';
import { internalUserDatabase } from './internal-user-access.js';
import { InternalUserError } from './internal-user-errors.js';
import { findInternalUser, requireActiveInternalUser, claimInternalUserRequest, encryptInternalUserToken,
  assertInternalUserTokenStore, internalUserAccessToken, saveInternalUserConnection, finishInternalUserSync } from './internal-user-repository.js';
import { createInternalUserHubstaff } from './internal-user-hubstaff.js';
import { internalUserPanelAccess, internalUserPosition } from './internal-user-positions.js';
import { effectiveInternalUserPanels, hasInternalPermission, internalUserPermissions } from './internal-permissions.js';
import { canAccessInternalPanel, canAccessInternalWorkspace } from './internal-panel-access.js';

async function loadInternalUserTeamDirectory(db) {
  const { rows } = await db.query(`SELECT e.user_id, e.position, u.display_name
    FROM portal_internal_users e JOIN portal_users u ON u.id=e.user_id
    WHERE e.is_active=TRUE
    ORDER BY u.display_name ASC`);
  return rows.map(row => ({
    id: String(row.user_id),
    name: row.display_name || 'Internal user',
    position: internalUserPosition(row.position).label,
  }));
}

export async function resolveInternalUserContext(requestHeaders) {
  if (!isPortalAuthConfigured()) throw new InternalUserError('internal_user_unavailable', 'Portal login needs administrator setup.');
  let session;
  try { session = await auth.api.getSession({ headers: requestHeaders }); }
  catch { throw new InternalUserError('internal_user_unavailable', 'Your session could not be verified. Please try again.'); }
  if (!session?.user?.id) throw new InternalUserError('authentication_required', 'Sign in to access your work dashboard.', 401);
  const internalUser = requireActiveInternalUser(await findInternalUser(internalUserDatabase(), session.user.id));
  const position = internalUserPosition(internalUser.position);
  const db = internalUserDatabase();
  const relation = await db.query("SELECT to_regclass('portal_internal_user_roles') AS relation");
  const roleRows = relation.rows[0]?.relation
    ? (await db.query('SELECT role_key FROM portal_internal_user_roles WHERE user_id=$1', [internalUser.user_id])).rows
    : [];
  const roles = roleRows.map(row => row.role_key);
  const panels = effectiveInternalUserPanels(internalUserPanelAccess(internalUser.panel_access, position.id), roles);
  const permissions = internalUserPermissions(roles);
  return { internalUser, profile: { name: internalUser.display_name || session.user.name || 'Internal user',
    connected: Boolean(internalUser.encrypted_access_token), position: position.label,
    positionId: position.id, panels, roles, permissions } };
}

export async function requireInternalUserPermission(requestHeaders, permission) {
  const context = await resolveInternalUserContext(requestHeaders);
  if (!hasInternalPermission(context.profile, permission)) {
    throw new InternalUserError('permission_forbidden', 'This internal role does not permit that action.', 403);
  }
  return context;
}

export async function loadInternalUserDashboard(requestHeaders, { workspace = 'personal' } = {}) {
  const { internalUser, profile } = await resolveInternalUserContext(requestHeaders);
  const db = internalUserDatabase();
  const panels = profile.panels;
  const personalAccess = canAccessInternalWorkspace(profile, 'personal');
  const teamAccess = canAccessInternalWorkspace(profile, 'team');
  if (!canAccessInternalWorkspace(profile, workspace) || workspace === 'internalSettings') {
    throw new InternalUserError('panel_forbidden', 'This internal workspace is not enabled for your account.', 403);
  }
  const teamMembers = workspace === 'team' && teamAccess
    ? await loadInternalUserTeamDirectory(db)
    : [];
  const base = {
    tasks: [],
    projects: [],
    connection: { connected: Boolean(internalUser.encrypted_access_token) },
    syncedAt: internalUser.last_synced_at ? new Date(internalUser.last_synced_at).toISOString() : null,
    teamMembers,
    access: {
      position: internalUserPosition(internalUser.position).label,
      panels,
    },
  };
  const needsPersonalWork = workspace === 'personal' && personalAccess;
  if (!internalUser.encrypted_access_token || !needsPersonalWork) return base;
  await claimInternalUserRequest(db, internalUser);
  const hubstaff = createInternalUserHubstaff();
  const token = await internalUserAccessToken(db, internalUser, process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY,
    refreshToken => hubstaff.exchange(refreshToken));
  let result;
  try {
    result = await hubstaff.dashboard(token, internalUser.hubstaff_user_id);
  } catch (error) {
    if (error?.publicDetails?.code !== 'invalid_token' || !internalUser.encrypted_refresh_token) throw error;
    // One 401-triggered renewal; never loop on a rejected or scope-limited token.
    const renewed = await internalUserAccessToken(db, internalUser, process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY,
      refreshToken => hubstaff.exchange(refreshToken), token);
    result = await hubstaff.dashboard(renewed, internalUser.hubstaff_user_id);
  }
  const syncedAt = await finishInternalUserSync(db, internalUser);
  const canOverview = canAccessInternalPanel(profile, 'overview');
  const canTasks = canAccessInternalPanel(profile, 'my_tasks');
  const canActivity = canAccessInternalPanel(profile, 'activity');
  const summaryTasks = (result.tasks || []).map(task => ({
    id: task.id, title: task.title, projectId: task.projectId, projectName: task.projectName,
    status: task.status, stage: task.stage, priority: task.priority, dueAt: task.dueAt,
    createdAt: task.createdAt, updatedAt: task.updatedAt, completedAt: task.completedAt,
  }));
  return { ...base,
    connection: result.connection,
    ...(canTasks ? { tasks: result.tasks, projects: result.projects } : {}),
    ...(!canTasks && canOverview ? { tasks: summaryTasks, projects: result.projects.map(project => ({
      id: project.id, name: project.name,
    })) } : {}),
    ...(!canOverview && !canTasks && canActivity ? { tasks: summaryTasks.map(task => ({
      id: task.id, title: task.title, projectName: task.projectName, status: task.status,
      updatedAt: task.updatedAt, completedAt: task.completedAt,
    })) } : {}),
    ...(canOverview ? { workSummary: result.workSummary } : {}),
    ...(canOverview || canTasks ? { truncated: result.truncated } : {}),
    teamMembers, access: base.access, syncedAt };
}

export async function connectInternalUserHubstaff(requestHeaders, token) {
  const { internalUser, profile } = await resolveInternalUserContext(requestHeaders);
  if (!profile.panels.includes('hubstaff') || !hasInternalPermission(profile, 'hubstaff.connection.manage')) {
    throw new InternalUserError('panel_forbidden', 'Hubstaff connection access is not enabled for this internal user.', 403);
  }
  const db = internalUserDatabase();
  await claimInternalUserRequest(db, internalUser, { connecting: true });
  await assertInternalUserTokenStore(db, internalUser);
  const hubstaff = createInternalUserHubstaff();
  const exchanged = await hubstaff.exchange(token);
  // Verify both current identity and Tasks read access before replacing any stored token.
  await hubstaff.dashboard(exchanged.accessToken, internalUser.hubstaff_user_id);
  const secret = process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY;
  await saveInternalUserConnection(db, internalUser,
    encryptInternalUserToken(exchanged.accessToken, internalUser, secret),
    encryptInternalUserToken(exchanged.refreshToken, internalUser, secret), exchanged.expiresAt);
}
