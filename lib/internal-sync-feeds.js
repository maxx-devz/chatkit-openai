// These are on-demand cache freshness limits, not background schedules.
export const INTERNAL_SYNC_FEEDS = Object.freeze([
  Object.freeze({ id: 'personal_work', label: 'My Work', workspace: 'My Work', defaultMinutes: 5 }),
  Object.freeze({ id: 'team_roster', label: 'AOC member directory', workspace: 'Team and HR', defaultMinutes: 60 }),
  Object.freeze({ id: 'team_status', label: 'Team work status', workspace: 'Team', defaultMinutes: 1 }),
  Object.freeze({ id: 'hr_records', label: 'Leave, balances and schedules', workspace: 'HR', defaultMinutes: 1440 }),
  Object.freeze({ id: 'pm_catalog', label: 'Project folders and projects', workspace: 'Project Management', defaultMinutes: 60 }),
  Object.freeze({ id: 'pm_project_tasks', label: 'Selected project tasks', workspace: 'Project Management', defaultMinutes: 5 }),
]);

export const INTERNAL_SYNC_MIN_MINUTES = 1;
export const INTERNAL_SYNC_MAX_MINUTES = 1440;

export function internalSyncFeed(id) {
  return INTERNAL_SYNC_FEEDS.find(feed => feed.id === id) || null;
}

export function validSyncInterval(value) {
  return Number.isSafeInteger(value) && value >= INTERNAL_SYNC_MIN_MINUTES
    && value <= INTERNAL_SYNC_MAX_MINUTES;
}
