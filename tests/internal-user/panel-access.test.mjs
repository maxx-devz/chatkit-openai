import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessInternalPanel, canAccessInternalWorkspace } from '../../lib/internal-panel-access.js';
import { INTERNAL_ASSIGNABLE_ROLES, internalUserPermissions } from '../../lib/internal-permissions.js';
import { availableInternalRolePanels, canViewInternalRolePanel, INTERNAL_ROLE_PANELS } from '../../lib/internal-role-panels.js';
import { INTERNAL_PM_NAV, INTERNAL_SETTINGS_NAV, visibleInternalSubnav } from '../../lib/internal-navigation.js';

const profile = (panels, roles = []) => ({ panels, permissions: internalUserPermissions(roles) });

test('each live personal panel needs its own assignment and permission', () => {
  for (const panel of ['overview', 'my_tasks', 'activity']) {
    assert.equal(canAccessInternalPanel(profile([panel]), panel), true);
    assert.equal(canAccessInternalPanel(profile([]), panel), false);
    assert.equal(canAccessInternalPanel({ panels: [panel], permissions: [] }, panel), false);
    assert.equal(canAccessInternalWorkspace(profile([panel]), 'personal'), true);
  }
  assert.equal(canAccessInternalWorkspace(profile([]), 'personal'), false);
});

test('basic Team access needs both the assigned panel and baseline permission, not a business role', () => {
  assert.equal(canAccessInternalWorkspace(profile(['team_directory']), 'team'), true);
  assert.equal(canAccessInternalWorkspace(profile([]), 'team'), false);
  assert.equal(canAccessInternalWorkspace(profile([], ['project_management']), 'team'), false);
  assert.equal(canAccessInternalWorkspace(profile(['team_directory'], ['project_management']), 'team'), true);
  assert.equal(canAccessInternalWorkspace(profile(['team_directory'], ['hr']), 'team'), true);
  assert.equal(canAccessInternalWorkspace({ panels: ['team_directory'], permissions: [] }, 'team'), false);
  assert.equal(canAccessInternalPanel(profile(['team_tasks'], ['internal_admin']), 'team_tasks'), false);
  assert.equal(canAccessInternalWorkspace(profile(['team_tasks']), 'team'), false);
});

test('personal Settings needs Account Settings or Hubstaff, while Internal Settings remains role-gated', () => {
  assert.equal(canAccessInternalWorkspace(profile(['hubstaff']), 'settings'), true);
  assert.equal(canAccessInternalWorkspace(profile(['account_settings']), 'settings'), true);
  assert.equal(canAccessInternalWorkspace(profile([]), 'settings'), false);
  assert.equal(canAccessInternalPanel(profile([]), 'account_settings'), false);
  assert.equal(canAccessInternalPanel(profile(['account_settings']), 'account_settings'), true);
  assert.equal(canAccessInternalPanel({ panels: ['account_settings'], permissions: [] }, 'account_settings'), false);
  assert.equal(canAccessInternalWorkspace({ panels: ['hubstaff'], permissions: [] }, 'settings'), false);
  assert.equal(canAccessInternalWorkspace(profile([], ['internal_access_manager']), 'internalSettings'), true);
  assert.equal(canAccessInternalWorkspace(profile([], ['internal_admin']), 'internalSettings'), true);
  assert.equal(canAccessInternalWorkspace(profile([], ['hr']), 'internalSettings'), false);
  assert.equal(canAccessInternalWorkspace(profile(['overview']), 'unknown'), false);
});

test('business roles open their workspace; admin can view panels and read live HR data', () => {
  assert.deepEqual(INTERNAL_ROLE_PANELS.map(panel => panel.id),
    INTERNAL_ASSIGNABLE_ROLES.filter(role => !['internal_access_manager', 'development', 'cro'].includes(role.id))
      .map(role => role.id));
  const hr = { ...profile(['hr_leave_calendar'], ['hr']), roles: ['hr'] };
  assert.deepEqual(availableInternalRolePanels(hr).map(panel => panel.id), ['hr']);
  assert.equal(canAccessInternalWorkspace(hr, 'roles'), true);
  assert.equal(canViewInternalRolePanel({ ...profile([], ['hr']), roles: ['hr'] }, 'hr'), false);
  assert.equal(canViewInternalRolePanel(hr, 'hr'), true);
  assert.equal(canViewInternalRolePanel(hr, 'sales'), false);
  assert.equal(canViewInternalRolePanel(hr, 'internal_access_manager'), false);
  assert.equal(canViewInternalRolePanel(hr, 'internal_admin'), false);
  assert.equal(canViewInternalRolePanel(hr, 'made_up_role'), false);
  assert.equal(canViewInternalRolePanel({ ...profile([], ['development']), roles: ['development'] }, 'development'), false);
  assert.equal(canAccessInternalPanel(hr, 'team_directory'), false);
  assert.equal(canAccessInternalWorkspace(hr, 'team'), false);
  assert.equal(internalUserPermissions(['hr']).includes('people.leave.read'), true);

  const pm = { ...profile(['pm_projects', 'pm_project_tasks'], ['project_management']),
    roles: ['project_management'] };
  assert.equal(canAccessInternalPanel(pm, 'pm_projects'), true);
  assert.equal(canAccessInternalPanel(pm, 'pm_project_tasks'), true);
  assert.equal(canViewInternalRolePanel(pm, 'project_management'), true);
  assert.equal(canViewInternalRolePanel({ ...pm, panels: [] }, 'project_management'), false);
  assert.equal(canAccessInternalPanel(profile(['pm_projects']), 'pm_projects'), false);
  assert.equal(canAccessInternalPanel(profile(['pm_project_tasks'], ['hr']), 'pm_project_tasks'), false);
  assert.deepEqual(visibleInternalSubnav(pm, INTERNAL_PM_NAV).map(item => item.id), ['projects', 'tasks']);
  assert.deepEqual(visibleInternalSubnav({ ...pm, panels: ['pm_projects'] }, INTERNAL_PM_NAV)
    .map(item => item.id), ['projects']);

  const admin = { ...profile([]), roles: ['internal_admin'] };
  assert.deepEqual(availableInternalRolePanels(admin).map(panel => panel.id), INTERNAL_ROLE_PANELS.map(panel => panel.id));
  assert.equal(canViewInternalRolePanel(admin, 'hr'), true);
  assert.equal(internalUserPermissions(['internal_admin']).includes('people.leave.read'), true);
  assert.equal(canViewInternalRolePanel(admin, 'billing'), true);
  assert.equal(canViewInternalRolePanel(admin, 'development'), false);
  assert.equal(canViewInternalRolePanel(admin, 'cro'), false);
  assert.equal(canViewInternalRolePanel(admin, 'internal_admin'), false);
  assert.equal(canAccessInternalWorkspace({ ...profile([]), roles: [] }, 'roles'), false);
});

test('Website Performance is one preview shared by SEO/GEO, Marketing, and CRO', () => {
  for (const role of ['seo_geo', 'marketing', 'cro']) {
    const viewer = { ...profile([], [role]), roles: [role] };
    assert.equal(canViewInternalRolePanel(viewer, 'seo_geo'), true);
    assert.equal(canViewInternalRolePanel(viewer, 'cro'), false);
    assert.equal(availableInternalRolePanels(viewer).filter(panel => panel.id === 'seo_geo').length, 1);
  }
  const croViewer = { ...profile([], ['cro']), roles: ['cro'] };
  assert.deepEqual(availableInternalRolePanels(croViewer).map(panel => panel.id), ['seo_geo']);
  assert.equal(internalUserPermissions(['cro']).includes('analytics.ga4.read'), false);
  assert.equal(canViewInternalRolePanel({ ...profile([]), roles: [] }, 'seo_geo'), false);
});

test('sidebar children require permission and enabled panels before appearing', () => {
  assert.deepEqual(visibleInternalSubnav(profile([], ['internal_access_manager']))
    .map(item => item.id), INTERNAL_SETTINGS_NAV.map(item => item.id));
  assert.deepEqual(visibleInternalSubnav(profile([], ['hr'])), []);
  const panelChildren = [
    { id: 'account', requiredPanel: 'account_settings' },
    { id: 'hubstaff', requiredPanel: 'hubstaff' },
  ];
  assert.deepEqual(visibleInternalSubnav(profile(['account_settings']), panelChildren)
    .map(item => item.id), ['account']);
  assert.deepEqual(visibleInternalSubnav(profile(['hubstaff']), panelChildren)
    .map(item => item.id), ['hubstaff']);
  assert.deepEqual(visibleInternalSubnav({ panels: ['hubstaff'], permissions: [] }, panelChildren), []);
  assert.deepEqual(visibleInternalSubnav(profile(['hubstaff']), [{ id: 'unguarded' }]), []);
});

test('planned workspaces describe useful panels without granting live data access', () => {
  const byRole = Object.fromEntries(INTERNAL_ROLE_PANELS.map(panel => [panel.id, panel]));
  assert.equal(byRole.seo_geo.label, 'Website Performance');
  assert.deepEqual(byRole.seo_geo.sections.map(section => section.title),
    ['Site traffic', 'Where visitors come from', 'Site conversions', 'Search visibility']);
  assert.match(byRole.seo_geo.sections[0].source, /GA4/);
  assert.equal(internalUserPermissions(['seo_geo']).includes('analytics.ga4.read'), false);
  assert.equal(byRole.billing.sections[0].title, 'Client billing status');
  assert.equal(byRole.sales.label, 'Sales Pipeline');
  assert.equal(byRole.support.label, 'Customer Support');
  assert.equal(byRole.marketing.label, 'Marketing Performance');
  assert.equal(byRole.leadership.label, 'Business Overview');
  assert.equal(byRole.development, undefined);
  assert.equal(byRole.cro, undefined);
});
