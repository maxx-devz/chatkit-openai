import { INTERNAL_USER_PANELS } from './internal-user-positions.js';

export function resolveInternalPanelPreview(searchParams, workspace, environment = process.env.NODE_ENV, host = '') {
  if (environment !== 'development'
    || !/^(localhost|127\.0\.0\.1|\[::1\])(?::[0-9]{1,5})?$/i.test(host)
    || typeof searchParams?.debug_panel !== 'string') return null;
  return INTERNAL_USER_PANELS.find(panel => panel.id === searchParams.debug_panel && panel.workspace === workspace) || null;
}

export function internalPanelPreviewData(now = new Date()) {
  const today = now.toISOString().slice(0, 10);
  const yesterday = new Date(now.valueOf() - 86_400_000).toISOString();
  const tomorrow = new Date(now.valueOf() + 86_400_000).toISOString();
  const tasks = [
    { id: 'preview-1', title: 'Review sample project plan', projectId: 'preview-project',
      projectName: 'Sample project', status: 'In Progress', stage: 'in_progress', done: false,
      description: 'Example task details. No Hubstaff data is used in this preview.',
      dueAt: tomorrow, createdAt: yesterday, updatedAt: yesterday },
    { id: 'preview-2', title: 'Complete sample handoff', projectId: 'preview-project',
      projectName: 'Sample project', status: 'Done', stage: 'done', done: true,
      completedAt: yesterday, createdAt: yesterday, updatedAt: yesterday },
  ];
  return {
    tasks,
    projects: [{ id: 'preview-project', name: 'Sample project' }],
    teamMembers: [
      { id: 'preview-member-1', name: 'Alex Example', position: 'Project Manager' },
      { id: 'preview-member-2', name: 'Taylor Example', position: 'Team Member' },
    ],
    connection: { connected: false, name: 'Sample Hubstaff account' },
    syncedAt: null,
    workSummary: { timeAvailable: true, timePartial: false, timeZone: 'UTC',
      today: { date: today, trackedHours: 2.5, activityRate: 64 },
      week: { start: today, stop: today, trackedHours: 17.75, activityRate: 67 } },
  };
}
