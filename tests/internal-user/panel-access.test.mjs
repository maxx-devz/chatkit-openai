import assert from 'node:assert/strict';
import test from 'node:test';
import { canAccessInternalPanel, canAccessInternalWorkspace } from '../../lib/internal-panel-access.js';
import { INTERNAL_ASSIGNABLE_ROLES, internalUserPermissions } from '../../lib/internal-permissions.js';
import { availableInternalRolePanels, canViewInternalRolePanel, INTERNAL_ROLE_PANELS } from '../../lib/internal-role-panels.js';

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

test('each business role opens only its Phase 0 placeholder; admin can view all', () => {
  assert.deepEqual(INTERNAL_ROLE_PANELS.map(panel => panel.id),
    INTERNAL_ASSIGNABLE_ROLES.filter(role => role.id !== 'internal_access_manager').map(role => role.id));
  const hr = { ...profile([]), roles: ['hr'] };
  assert.deepEqual(availableInternalRolePanels(hr).map(panel => panel.id), ['hr']);
  assert.equal(canAccessInternalWorkspace(hr, 'roles'), true);
  assert.equal(canViewInternalRolePanel(hr, 'hr'), true);
  assert.equal(canViewInternalRolePanel(hr, 'sales'), false);
  assert.equal(canViewInternalRolePanel(hr, 'internal_access_manager'), false);
  assert.equal(canViewInternalRolePanel(hr, 'internal_admin'), false);
  assert.equal(canViewInternalRolePanel(hr, 'made_up_role'), false);
  assert.equal(canAccessInternalPanel(hr, 'team_directory'), false);
  assert.equal(canAccessInternalWorkspace(hr, 'team'), false);
  assert.equal(internalUserPermissions(['hr']).includes('people.leave.read'), false);

  const admin = { ...profile([]), roles: ['internal_admin'] };
  assert.deepEqual(availableInternalRolePanels(admin).map(panel => panel.id), INTERNAL_ROLE_PANELS.map(panel => panel.id));
  assert.equal(canViewInternalRolePanel(admin, 'billing'), true);
  assert.equal(canViewInternalRolePanel(admin, 'internal_admin'), false);
  assert.equal(canAccessInternalWorkspace({ ...profile([]), roles: [] }, 'roles'), false);
});
