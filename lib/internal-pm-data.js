import 'server-only';

import { getHubstaffPatAccessToken } from './hubstaff-auth.js';
import { readHubstaffPmCatalog, readHubstaffPmProjectTasks } from './internal-hubstaff-pm.js';
import { InternalUserError } from './internal-user-errors.js';
import { requireInternalUserPermission } from './internal-user-data.js';
import { internalUserDatabase } from './internal-user-access.js';
import { canAccessInternalPanel } from './internal-panel-access.js';
import { hasInternalPermission } from './internal-permissions.js';
import { INTERNAL_PM_PANEL_IDS } from './internal-user-positions.js';
import { readInternalSyncFeed } from './internal-sync-cache.js';
import { auditInternalPanelReads } from './internal-panel-audit.js';
import { finishIntegrationRun, safeIntegrationErrorCode, startIntegrationRun } from './integration-run-audit.js';

function sourceError() {
  return new InternalUserError('hubstaff_unavailable',
    'Project Management data is temporarily unavailable. Please try again.');
}

function validProjectId(value) {
  return typeof value === 'string' && /^[1-9][0-9]*$/.test(value)
    && Number.isSafeInteger(Number(value));
}

async function auditedSource(db, operation, actorUserId, load) {
  const runId = await startIntegrationRun(db, { source: 'hubstaff_tasks', operation, actorUserId });
  try {
    const result = await load();
    const count = operation === 'pm_catalog'
      ? result.folders.length + result.projects.length + result.members.length : result.tasks.length;
    await finishIntegrationRun(db, runId, { status: result.truncated ? 'partial' : 'succeeded',
      recordsProcessed: count });
    return result;
  } catch (error) {
    try { await finishIntegrationRun(db, runId, { status: 'failed',
      errorCode: safeIntegrationErrorCode(error) }); } catch { /* Preserve source failure. */ }
    throw sourceError();
  }
}

export async function loadInternalPmDashboard(requestHeaders, projectId = null, { force = false } = {}) {
  const { internalUser, profile } = await requireInternalUserPermission(requestHeaders, 'work.projects.read');
  if (!profile.roles.some(role => role === 'project_management' || role === 'internal_admin')) {
    throw new InternalUserError('permission_forbidden', 'Project Management access is required.', 403);
  }
  const visiblePanels = INTERNAL_PM_PANEL_IDS.filter(panel => canAccessInternalPanel(profile, panel));
  if (!visiblePanels.length) {
    throw new InternalUserError('panel_forbidden', 'No Project Management panels are enabled.', 403);
  }
  if (projectId !== null && !validProjectId(projectId)) {
    throw new InternalUserError('invalid_request', 'Choose a valid project.', 400);
  }
  if (projectId !== null && (!visiblePanels.includes('pm_project_tasks')
    || !hasInternalPermission(profile, 'work.team_tasks.read'))) {
    throw new InternalUserError('panel_forbidden', 'Project tasks are not enabled for this account.', 403);
  }
  if (!process.env.HUBSTAFF_PAT_REFRESH_TOKEN?.trim()) throw sourceError();
  const db = internalUserDatabase();
  let catalog;
  try {
    catalog = await readInternalSyncFeed(db, { feed: 'pm_catalog', withMeta: true, force,
      scope: [process.env.HUBSTAFF_PAT_REFRESH_TOKEN, process.env.HUBSTAFF_TASKS_ORGANIZATION_ID],
      loader: () => auditedSource(db, 'pm_catalog', internalUser.user_id, async () =>
        readHubstaffPmCatalog(await getHubstaffPatAccessToken())),
    });
  } catch { throw sourceError(); }
  const source = catalog.value;
  const selectedProject = projectId === null ? null
    : source.projects.find(project => project.id === projectId);
  if (projectId !== null && !selectedProject) {
    throw new InternalUserError('project_not_found', 'This project is not available in the AOC workspace.', 404);
  }
  let taskResult = null;
  if (selectedProject) {
    try {
      taskResult = await readInternalSyncFeed(db, { feed: 'pm_project_tasks', withMeta: true, force,
        scope: [process.env.HUBSTAFF_PAT_REFRESH_TOKEN, source.organizationId, selectedProject.id],
        loader: () => auditedSource(db, 'pm_project_tasks', internalUser.user_id, async () =>
          readHubstaffPmProjectTasks(await getHubstaffPatAccessToken(), selectedProject.id)),
      });
    } catch { throw sourceError(); }
  }
  const memberNames = new Map(source.members.map(member => [member.id, member.name]));
  await auditInternalPanelReads(db, internalUser.user_id, visiblePanels);
  return {
    organizationName: source.organizationName,
    visiblePanels,
    folders: source.folders,
    projects: source.projects,
    selectedProjectId: selectedProject?.id || null,
    tasks: taskResult?.value.tasks.map(({ assigneeIds, ...task }) => ({ ...task,
      assignees: assigneeIds.map(id => memberNames.get(id) || 'Hubstaff member'),
    })) || [],
    truncated: taskResult?.value.truncated || false,
    freshness: { catalog: catalog.freshness, projectTasks: taskResult?.freshness || null },
  };
}
