import assert from 'node:assert/strict';
import test from 'node:test';
import { effectiveInternalUserPanels, hasInternalPermission, INTERNAL_ADMIN_PANELS, INTERNAL_ASSIGNABLE_ROLES,
  canManageInternalRole, internalPermissionScope, internalUserPermissions, visibleInternalRoleLabels } from '../../lib/internal-permissions.js';
import { INTERNAL_USER_PANELS } from '../../lib/internal-user-positions.js';

test('baseline includes personal permissions and the basic Team directory', () => {
  const permissions = internalUserPermissions();
  assert.equal(permissions.includes('work.tasks.read'), true);
  assert.equal(permissions.includes('people.directory.read'), true);
  assert.equal(permissions.includes('people.work_status.read'), true);
  assert.equal(permissions.includes('internal_users.read'), false);
});

test('functional roles add explicit grants and unknown future roles fail closed', () => {
  const project = internalUserPermissions(['project_management']);
  assert.deepEqual(project, internalUserPermissions());
  assert.equal(project.includes('people.directory.read'), true);
  assert.equal(project.includes('internal_users.read'), false);
  const manager = internalUserPermissions(['internal_access_manager']);
  assert.equal(hasInternalPermission({ permissions: manager }, 'internal_users.status.update'), true);
  assert.equal(internalUserPermissions(['hr']).includes('people.leave.read'), true);
  assert.equal(internalUserPermissions(['hr']).includes('people.leave_balance.read'), true);
  assert.equal(internalUserPermissions(['hr']).includes('people.schedules.read'), true);
  assert.equal(INTERNAL_ASSIGNABLE_ROLES.some(role => role.id === 'hr' && !role.planned), true);
  assert.equal(INTERNAL_ASSIGNABLE_ROLES.some(role => role.id === 'project_management' && role.planned), true);
  assert.equal(INTERNAL_ASSIGNABLE_ROLES.some(role => role.id === 'internal_admin'), false);
  assert.equal(internalPermissionScope('work.tasks.read'), 'Self');
  assert.equal(internalPermissionScope('people.directory.read'), 'Organization · basic fields');
  assert.equal(internalPermissionScope('internal_users.roles.manage'), 'Internal accounts');
  assert.equal(internalPermissionScope('people.work_status.read'), 'Organization: derived Team status only');
  assert.equal(internalPermissionScope('people.leave.read'), 'AOC team: HR records only');
});

test('an assigned business role gains its implemented permissions without a second approval', () => {
  const futureRoles = { hr: ['people.leave.read', 'people.availability.read'] };
  const permissions = internalUserPermissions(['hr'], futureRoles);
  assert.equal(permissions.includes('people.leave.read'), true);
  assert.equal(permissions.includes('people.availability.read'), true);
  assert.equal(internalUserPermissions(['sales'], futureRoles).includes('people.leave.read'), false);
  assert.equal(canManageInternalRole(['internal_access_manager'], 'hr'), true);
  assert.equal(canManageInternalRole(['internal_admin'], 'hr'), true);
  assert.equal(canManageInternalRole([], 'hr'), false);
  assert.equal(canManageInternalRole(['internal_access_manager'], 'unknown_role'), false);
  assert.equal(canManageInternalRole(['internal_access_manager'], 'internal_access_manager'), false);
  assert.equal(canManageInternalRole(['internal_access_manager'], 'internal_access_manager', 'revoke'), false);
  assert.equal(canManageInternalRole(['internal_admin'], 'internal_access_manager'), true);
  assert.equal(canManageInternalRole(['internal_admin'], 'internal_access_manager', 'revoke'), true);
});

test('internal admin inherits all current live grants and sees all current panels', () => {
  const permissions = internalUserPermissions(['internal_admin']);
  const managerPermissions = internalUserPermissions(['internal_access_manager']);
  for (const permission of managerPermissions) assert.equal(permissions.includes(permission), true);
  assert.equal(permissions.includes('platform.audit.read'), true);
  assert.equal(managerPermissions.includes('platform.audit.read'), true);
  assert.equal(permissions.includes('internal_users.roles.manage'), true);
  assert.equal(permissions.includes('people.directory.read'), true);
  assert.equal(permissions.includes('internal_users.read'), true);
  assert.equal(permissions.includes('internal_users.create'), true);
  assert.equal(permissions.includes('internal_users.profile.update'), true);
  assert.equal(permissions.includes('internal_users.panel_access.update'), true);
  assert.equal(permissions.includes('internal_users.hubstaff_mapping.update'), true);
  assert.equal(permissions.includes('internal_users.status.update'), true);
  for (const permission of internalUserPermissions(['hr'])) assert.equal(permissions.includes(permission), true);
  assert.deepEqual(INTERNAL_ADMIN_PANELS, INTERNAL_USER_PANELS.map(panel => panel.id));
  assert.deepEqual(effectiveInternalUserPanels(['overview'], ['internal_admin']), INTERNAL_ADMIN_PANELS);
  assert.deepEqual(effectiveInternalUserPanels(['overview'], []), ['overview']);
});

test('internal admin remains effective but its role name is omitted from UI labels', () => {
  assert.deepEqual(visibleInternalRoleLabels(['internal_admin']), []);
  assert.deepEqual(visibleInternalRoleLabels(['internal_admin', 'internal_access_manager']), ['internal access manager']);
});
