import 'server-only';
import { auth, isPortalAuthConfigured } from './auth.js';
import { internalUserDatabase } from './internal-user-access.js';
import { InternalUserError } from './internal-user-errors.js';
import { findInternalUser, requireActiveInternalUser, claimInternalUserRequest, encryptInternalUserToken,
  assertInternalUserTokenStore, internalUserAccessToken, saveInternalUserConnection, finishInternalUserSync } from './internal-user-repository.js';
import { createInternalUserHubstaff } from './internal-user-hubstaff.js';
import { INTERNAL_USER_PANELS, internalUserPanelAccess, internalUserPosition } from './internal-user-positions.js';
import { effectiveInternalUserPanels, hasInternalPermission, internalUserPermissions } from './internal-permissions.js';
import { canAccessInternalPanel, canAccessInternalWorkspace } from './internal-panel-access.js';
import { finishIntegrationRun, safeIntegrationErrorCode, startIntegrationRun } from './integration-run-audit.js';
import { isHubstaffTeamStatusConfigured, loadHubstaffTeamStatuses } from './internal-hubstaff-team-status.js';
import { listActiveHubstaffMembers } from './internal-hubstaff-members.js';
import { TEAM_WORK_STATUS } from './internal-team-work-status.js';
import { readInternalSyncFeed } from './internal-sync-cache.js';
import { auditInternalPanelReads } from './internal-panel-audit.js';

async function loadInternalUserTeamDirectory(db, actorUserId, force = false) {
  let cached;
  try { cached = await readInternalSyncFeed(db, { feed: 'team_roster',
    scope: [process.env.HUBSTAFF_ACCESS_TOKEN, process.env.HUBSTAFF_INTERNAL_TEAM_ID],
    loader: async () => {
      const runId = await startIntegrationRun(db, {
        source: 'hubstaff', operation: 'team_directory', actorUserId,
      });
      try {
        const members = await listActiveHubstaffMembers();
        await finishIntegrationRun(db, runId, { status: 'succeeded', recordsProcessed: members.length });
        return members;
      } catch (error) {
        try {
          await finishIntegrationRun(db, runId, { status: 'failed',
            errorCode: safeIntegrationErrorCode(error) });
        } catch { /* Keep the original provider failure. */ }
        throw error;
      }
    }, force, withMeta: true }); }
  catch {
    throw new InternalUserError('team_directory_unavailable',
      'The AOC team directory is temporarily unavailable. Please try again.');
  }
  const { rows } = await db.query('SELECT hubstaff_user_id, position FROM portal_internal_users');
  const portalAccounts = new Map(rows.map(row => [String(row.hubstaff_user_id), row.position]));
  return { members: cached.value.map((member, index) => ({
    id: `team-member-${index + 1}`,
    name: member.name,
    position: portalAccounts.has(member.id) ? internalUserPosition(portalAccounts.get(member.id)).label : null,
    portalAccountMapped: portalAccounts.has(member.id),
    hubstaffUserId: member.id,
  })), freshness: cached.freshness };
}

async function loadTeamStatuses(db, teamMembers, actorUserId, force = false) {
  const unknown = new Map(teamMembers.map(member => [member.hubstaffUserId, TEAM_WORK_STATUS.UNKNOWN]));
  if (!isHubstaffTeamStatusConfigured() || !teamMembers.length) return { statuses: unknown, freshness: null };
  try {
    const ids = teamMembers.map(member => member.hubstaffUserId);
    const cached = await readInternalSyncFeed(db, { feed: 'team_status',
      scope: [process.env.HUBSTAFF_ACCESS_TOKEN, ids, process.env.HUBSTAFF_TEAM_SCHEDULES_VERIFIED], force,
      withMeta: true,
      loader: async () => {
        const runId = await startIntegrationRun(db, {
          source: 'hubstaff', operation: 'team_work_status', actorUserId,
        });
        try {
          const result = await loadHubstaffTeamStatuses(ids);
          await finishIntegrationRun(db, runId, {
            status: 'succeeded', recordsProcessed: result.recordsProcessed,
          });
          return Object.fromEntries(result.statuses);
        } catch (error) {
          await finishIntegrationRun(db, runId, { status: 'failed', errorCode: safeIntegrationErrorCode(error) });
          throw error;
        }
      },
    });
    return { statuses: new Map(Object.entries(cached.value)), freshness: cached.freshness };
  } catch (error) {
    // Status remains Unknown when Hubstaff cannot verify it.
    return { statuses: unknown, freshness: null };
  }
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
  let roleRows = [];
  if (relation.rows[0]?.relation) {
    roleRows = (await db.query('SELECT role_key FROM portal_internal_user_roles WHERE user_id=$1',
      [internalUser.user_id])).rows;
  }
  const roles = roleRows.map(row => row.role_key);
  const panels = effectiveInternalUserPanels(internalUserPanelAccess(internalUser.panel_access, position.id), roles);
  const permissions = internalUserPermissions(roles);
  return { internalUser, authUser: session.user,
    profile: { name: internalUser.display_name || session.user.name || 'Internal user',
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

export async function loadInternalUserDashboard(requestHeaders, { workspace = 'personal', force = false } = {}) {
  const { internalUser, profile } = await resolveInternalUserContext(requestHeaders);
  const db = internalUserDatabase();
  const panels = profile.panels;
  const personalAccess = canAccessInternalWorkspace(profile, 'personal');
  const teamAccess = canAccessInternalWorkspace(profile, 'team');
  if (!canAccessInternalWorkspace(profile, workspace) || workspace === 'internalSettings') {
    throw new InternalUserError('panel_forbidden', 'This internal workspace is not enabled for your account.', 403);
  }
  const auditPanels = INTERNAL_USER_PANELS
    .filter(panel => panel.workspace === workspace && canAccessInternalPanel(profile, panel.id))
    .map(panel => panel.id);
  const teamDirectoryData = workspace === 'team' && teamAccess
    ? await loadInternalUserTeamDirectory(db, internalUser.user_id, force)
    : { members: [], freshness: null };
  const teamDirectory = teamDirectoryData.members;
  const statusAccess = workspace === 'team' && hasInternalPermission(profile, 'people.work_status.read');
  const teamStatusData = statusAccess
    ? await loadTeamStatuses(db, teamDirectory, internalUser.user_id, force)
    : { statuses: new Map(), freshness: null };
  const statusByHubstaffId = teamStatusData.statuses;
  const teamMembers = teamDirectory.map(({ hubstaffUserId, ...member }) => ({ ...member,
    ...(statusAccess ? { workStatus: statusByHubstaffId.get(hubstaffUserId) || TEAM_WORK_STATUS.UNKNOWN } : {}),
  }));
  const includeConnection = workspace !== 'settings' || canAccessInternalPanel(profile, 'hubstaff');
  const base = {
    tasks: [],
    projects: [],
    ...(includeConnection ? {
      connection: { connected: Boolean(internalUser.encrypted_access_token) },
      syncedAt: internalUser.last_synced_at ? new Date(internalUser.last_synced_at).toISOString() : null,
    } : {}),
    teamMembers,
    ...(workspace === 'team' ? { freshness: {
      teamDirectory: teamDirectoryData.freshness, teamStatus: teamStatusData.freshness,
    } } : {}),
    access: {
      position: internalUserPosition(internalUser.position).label,
      panels,
    },
  };
  const needsPersonalWork = workspace === 'personal' && personalAccess;
  if (!internalUser.encrypted_access_token || !needsPersonalWork) {
    await auditInternalPanelReads(db, internalUser.user_id, auditPanels);
    return base;
  }
  const personalWork = await readInternalSyncFeed(db, { feed: 'personal_work',
    scope: [internalUser.user_id, internalUser.hubstaff_user_id, internalUser.encrypted_access_token,
      internalUser.encrypted_refresh_token, new Date().toISOString().slice(0, 10)], force, withMeta: true,
    loader: async () => {
      await claimInternalUserRequest(db, internalUser);
      const runId = await startIntegrationRun(db, {
        source: 'hubstaff', operation: 'internal_dashboard', actorUserId: internalUser.user_id,
      });
      let retryCount = 0;
      let result;
      let syncedAt;
      try {
        const hubstaff = createInternalUserHubstaff();
        const token = await internalUserAccessToken(db, internalUser, process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY,
          refreshToken => hubstaff.exchange(refreshToken));
        try {
          result = await hubstaff.dashboard(token, internalUser.hubstaff_user_id);
        } catch (error) {
          if (error?.publicDetails?.code !== 'invalid_token' || !internalUser.encrypted_refresh_token) throw error;
          retryCount = 1;
          const renewed = await internalUserAccessToken(db, internalUser, process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY,
            refreshToken => hubstaff.exchange(refreshToken), token);
          result = await hubstaff.dashboard(renewed, internalUser.hubstaff_user_id);
        }
        syncedAt = await finishInternalUserSync(db, internalUser);
      } catch (error) {
        await finishIntegrationRun(db, runId, { status: 'failed', retryCount,
          errorCode: safeIntegrationErrorCode(error) });
        throw error;
      }
      await finishIntegrationRun(db, runId, { status: result.truncated ? 'partial' : 'succeeded', retryCount,
        recordsProcessed: (result.tasks?.length || 0) + (result.projects?.length || 0) });
      return { result, syncedAt };
    },
  });
  const { result, syncedAt } = personalWork.value;
  const canOverview = canAccessInternalPanel(profile, 'overview');
  const canTasks = canAccessInternalPanel(profile, 'my_tasks');
  const canActivity = canAccessInternalPanel(profile, 'activity');
  const summaryTasks = (result.tasks || []).map(task => ({
    id: task.id, title: task.title, projectId: task.projectId, projectName: task.projectName,
    status: task.status, stage: task.stage, priority: task.priority, dueAt: task.dueAt,
    createdAt: task.createdAt, updatedAt: task.updatedAt, completedAt: task.completedAt,
  }));
  await auditInternalPanelReads(db, internalUser.user_id, auditPanels);
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
    teamMembers, access: base.access, syncedAt, freshness: { personalWork: personalWork.freshness } };
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
