import { INTERNAL_HR_PANEL_IDS } from './internal-user-positions.js';

const INTERNAL_ACCESS_MANAGER_PERMISSIONS = Object.freeze([
  'internal_users.read', 'internal_users.create',
  'internal_users.profile.update', 'internal_users.panel_access.update',
  'internal_users.hubstaff_mapping.update', 'internal_users.status.update',
  'internal_users.roles.manage', 'internal_users.password.reset',
  'platform.audit.read',
]);

const INTERNAL_HR_PERMISSIONS = Object.freeze([
  'people.leave.read', 'people.leave_balance.read', 'people.schedules.read',
  'people.availability.read', 'work.capacity.read',
]);

// Planned roles can be assigned during Phase 0. HR is the first business role
// with a live, read-only source; other role grants remain placeholders.
export const INTERNAL_ASSIGNABLE_ROLES = Object.freeze([
  { id: 'project_management', label: 'Project Management', planned: true,
    plannedPermissions: ['work.team_tasks.read', 'work.time.read', 'people.availability.read', 'clients.profile.read',
      'crm.deals.read', 'support.conversations.read', 'billing.readiness.read'] },
  { id: 'leadership', label: 'Leadership', planned: true,
    plannedPermissions: ['reporting.executive.read', 'work.capacity.read', 'crm.summary.read',
      'support.summary.read', 'analytics.summary.read', 'finance.summary.read'] },
  { id: 'hr', label: 'HR', planned: false,
    plannedPermissions: [] },
  { id: 'sales', label: 'Sales', planned: true,
    plannedPermissions: ['crm.records.read', 'clients.profile.read'] },
  { id: 'support', label: 'Support', planned: true,
    plannedPermissions: ['support.conversations.read', 'clients.profile.read'] },
  { id: 'marketing', label: 'Marketing', planned: true,
    plannedPermissions: ['content.pipeline.read', 'analytics.ga4.read'] },
  { id: 'seo_geo', label: 'SEO/GEO', planned: true,
    plannedPermissions: ['search.gsc.read', 'seo.registry.read', 'seo.research.read'] },
  { id: 'cro', label: 'CRO', planned: true,
    plannedPermissions: ['analytics.ga4.read', 'analytics.behavior_summary.read'] },
  { id: 'development', label: 'Development', planned: true,
    plannedPermissions: ['work.tasks.read', 'sites.inventory.read', 'tech.stack.read'] },
  { id: 'billing', label: 'Billing', planned: true,
    plannedPermissions: ['billing.status.read', 'finance.spend_summary.read'] },
  { id: 'internal_access_manager', label: 'Internal Access Manager', planned: false,
    plannedPermissions: [] },
]);

export const INTERNAL_ASSIGNABLE_ROLE_IDS = Object.freeze(INTERNAL_ASSIGNABLE_ROLES.map(role => role.id));

export const INTERNAL_ROLE_PERMISSIONS = Object.freeze({
  project_management: Object.freeze([]),
  leadership: Object.freeze([]),
  hr: INTERNAL_HR_PERMISSIONS,
  sales: Object.freeze([]),
  support: Object.freeze([]),
  marketing: Object.freeze([]),
  seo_geo: Object.freeze([]),
  cro: Object.freeze([]),
  development: Object.freeze([]),
  billing: Object.freeze([]),
  internal_access_manager: INTERNAL_ACCESS_MANAGER_PERMISSIONS,
  internal_admin: Object.freeze([
    ...INTERNAL_ACCESS_MANAGER_PERMISSIONS,
    ...INTERNAL_HR_PERMISSIONS,
  ]),
});

export function canManageInternalRole(actorRoles, role, action = 'grant') {
  if (!INTERNAL_ASSIGNABLE_ROLE_IDS.includes(role)) return false;
  if (role === 'internal_access_manager') {
    return ['grant', 'revoke'].includes(action) && actorRoles.includes('internal_admin');
  }
  return actorRoles.includes('internal_access_manager') || actorRoles.includes('internal_admin');
}

// Deliberately explicit: a future panel must not become admin-visible automatically.
export const INTERNAL_ADMIN_PANELS = Object.freeze([
  'overview', 'my_tasks', 'activity', 'team_directory', 'account_settings', 'hubstaff',
  ...INTERNAL_HR_PANEL_IDS,
]);

export function effectiveInternalUserPanels(panels, roles = []) {
  if (roles.includes('internal_admin')) return [...INTERNAL_ADMIN_PANELS];
  const selected = new Set(Array.isArray(panels) ? panels : []);
  return [...selected];
}

export function visibleInternalRoleLabels(roles = []) {
  return roles.filter(role => role !== 'internal_admin')
    .map(role => role.replaceAll('_', ' '));
}

const SELF_PERMISSIONS = Object.freeze([
  'work.overview.read', 'work.tasks.read', 'work.activity.read',
  'hubstaff.connection.read', 'hubstaff.connection.manage',
  'account.password.change',
]);

export function internalUserPermissions(roles = [], rolePermissions = INTERNAL_ROLE_PERMISSIONS) {
  const permissions = new Set([...SELF_PERMISSIONS, 'people.directory.read', 'people.work_status.read']);
  for (const role of roles) {
    for (const permission of rolePermissions[role] || []) permissions.add(permission);
  }
  return [...permissions];
}

export function internalPermissionScope(permission) {
  if (permission.startsWith('internal_users.')) return 'Internal accounts';
  if (permission === 'platform.audit.read') return 'Portal operational and access audit';
  if (permission === 'people.work_status.read') return 'Organization: derived Team status only';
  if (INTERNAL_ROLE_PERMISSIONS.hr.includes(permission)) return 'AOC team: HR records only';
  if (permission === 'people.directory.read') return 'Organization · basic fields';
  if (SELF_PERMISSIONS.includes(permission)) return 'Self';
  return 'Scope not specified';
}

export function hasInternalPermission(context, permission) {
  return context?.permissions?.includes(permission) === true;
}
