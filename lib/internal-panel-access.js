import { availableInternalRolePanels } from './internal-role-panels.js';

const LIVE_PANEL_PERMISSIONS = Object.freeze({
  overview: 'work.overview.read',
  my_tasks: 'work.tasks.read',
  activity: 'work.activity.read',
  team_directory: 'people.directory.read',
  account_settings: 'account.password.change',
  hubstaff: 'hubstaff.connection.read',
});

export function canAccessInternalPanel(profile, panel) {
  const permission = LIVE_PANEL_PERMISSIONS[panel];
  return Boolean(permission) && profile?.panels?.includes(panel) === true
    && profile?.permissions?.includes(permission) === true;
}

export function canAccessInternalWorkspace(profile, workspace) {
  if (workspace === 'personal') {
    return ['overview', 'my_tasks', 'activity'].some(panel => canAccessInternalPanel(profile, panel));
  }
  if (workspace === 'team') return canAccessInternalPanel(profile, 'team_directory');
  if (workspace === 'settings') return ['account_settings', 'hubstaff']
    .some(panel => canAccessInternalPanel(profile, panel));
  if (workspace === 'internalSettings') return profile?.permissions?.includes('internal_users.read') === true;
  if (workspace === 'roles') return availableInternalRolePanels(profile).length > 0;
  return false;
}
