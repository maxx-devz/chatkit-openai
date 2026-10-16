import { canAccessInternalPanel } from './internal-panel-access.js';

export const INTERNAL_SETTINGS_NAV = Object.freeze([
  { id: 'users', label: 'Users & Access', href: '/internal/internal-settings', icon: 'shield',
    requiredPermission: 'internal_users.read' },
  { id: 'integrations', label: 'Integrations', href: '/internal/internal-settings/integrations', icon: 'connection',
    requiredPermission: 'internal_users.read' },
  { id: 'sync', label: 'Sync', href: '/internal/internal-settings/sync', icon: 'sync',
    requiredPermission: 'internal_users.read' },
]);

export const INTERNAL_PM_NAV = Object.freeze([
  { id: 'projects', label: 'Projects', href: '/internal/roles/project_management#pm-projects',
    icon: 'overview', requiredPanel: 'pm_projects', requiredPermission: 'work.projects.read' },
  { id: 'tasks', label: 'Project Tasks', href: '/internal/roles/project_management#pm-tasks',
    icon: 'tasks', requiredPanel: 'pm_project_tasks', requiredPermission: 'work.team_tasks.read' },
]);

// Every future panel-backed child must pass both its saved toggle and live permission.
export function visibleInternalSubnav(profile, items = INTERNAL_SETTINGS_NAV) {
  return items.filter(item => (item.requiredPermission || item.requiredPanel)
    && (!item.requiredPermission
    || profile?.permissions?.includes(item.requiredPermission) === true)
    && (!item.requiredPanel || canAccessInternalPanel(profile, item.requiredPanel)));
}
