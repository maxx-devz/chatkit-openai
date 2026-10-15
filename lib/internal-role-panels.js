import { INTERNAL_ASSIGNABLE_ROLES } from './internal-permissions.js';
import { INTERNAL_HR_PANEL_IDS } from './internal-user-positions.js';

// Most Phase 0 workspaces remain navigation-only placeholders. HR has a
// separate live reader with its own server-side role and permission checks.
const ROLE_PANEL_CONTENT = Object.freeze({
  project_management: ['Team tasks and workload', 'Tracked time', 'Project and client status'],
  leadership: ['Executive reporting', 'Capacity', 'Business summaries'],
  hr: ['People and schedules', 'Leave requests', 'Leave balances'],
  sales: ['Pipeline', 'Assigned clients'],
  support: ['Conversations', 'Assigned clients'],
  marketing: ['Content pipeline', 'Campaign analytics'],
  seo_geo: ['Search performance', 'SEO registry and research'],
  cro: ['Conversion analytics', 'Behavior summaries'],
  development: ['Project work', 'Site inventory', 'Technology stack'],
  billing: ['Billing status', 'Spend summaries'],
});

export const INTERNAL_ROLE_PANELS = Object.freeze(INTERNAL_ASSIGNABLE_ROLES
  .filter(role => Object.hasOwn(ROLE_PANEL_CONTENT, role.id))
  .map(role => Object.freeze({ id: role.id, label: role.label,
    sections: ROLE_PANEL_CONTENT[role.id] })));

const ROLE_PANEL_BY_ID = new Map(INTERNAL_ROLE_PANELS.map(panel => [panel.id, panel]));

export function internalRolePanel(id) {
  return ROLE_PANEL_BY_ID.get(id);
}

export function availableInternalRolePanels(profile) {
  const roles = Array.isArray(profile?.roles) ? profile.roles : [];
  return INTERNAL_ROLE_PANELS.filter(panel => roles.includes('internal_admin')
    || roles.includes(panel.id) && (panel.id !== 'hr'
      || INTERNAL_HR_PANEL_IDS.some(id => profile?.panels?.includes(id))));
}

export function canViewInternalRolePanel(profile, id) {
  return Boolean(internalRolePanel(id)) && availableInternalRolePanels(profile).some(panel => panel.id === id);
}
