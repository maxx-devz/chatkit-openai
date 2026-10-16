import assert from 'node:assert/strict';
import test from 'node:test';

import {
  internalUserHasPanel,
  internalUserPanelAccess,
  internalUserPosition,
  INTERNAL_USER_WORKSPACES,
  isInternalUserPosition,
} from '../../lib/internal-user-positions.js';

test('internal user positions provide stable default panel policies', () => {
  assert.equal(internalUserPosition('team_member').label, 'Team Member');
  assert.deepEqual(internalUserPanelAccess(undefined, 'team_member'), [
    'overview', 'my_tasks', 'activity', 'team_directory', 'account_settings', 'hubstaff',
  ]);
  assert.deepEqual(internalUserPanelAccess(undefined, 'project_manager'), [
    'overview', 'my_tasks', 'activity', 'team_directory', 'account_settings', 'hubstaff',
    'pm_projects', 'pm_project_tasks',
  ]);
  for (const [id, label] of [
    ['account_manager', 'Account Manager'],
    ['hr_admin', 'HR Admin'],
  ]) {
    assert.equal(internalUserPosition(id).label, label);
    assert.equal(isInternalUserPosition(id), true);
    assert.deepEqual(internalUserPanelAccess(undefined, id), [
      'overview', 'my_tasks', 'activity', 'team_directory', 'account_settings', 'hubstaff',
    ]);
  }
  assert.equal(isInternalUserPosition('project_manager'), true);
  assert.equal(isInternalUserPosition('invented_position'), false);
  assert.deepEqual(INTERNAL_USER_WORKSPACES.map((workspace) => [workspace.label, workspace.path]), [
    ['My Work', '/internal'],
    ['Team', '/internal/team'],
    ['Settings', '/internal/settings'],
  ]);
});

test('custom panel access is allow-listed, ordered, and checked explicitly', () => {
  assert.deepEqual(
    internalUserPanelAccess(['hubstaff', 'unsupported', 'overview', 'overview'], 'team_member'),
    ['overview', 'hubstaff'],
  );
  assert.equal(internalUserHasPanel({ position: 'project_manager' }, 'team_directory'), true);
  assert.equal(internalUserHasPanel({ position: 'team_member' }, 'team_directory'), true);
  assert.equal(internalUserHasPanel({ position: 'project_manager', panel_access: ['overview'] }, 'team_directory'), false);
  assert.deepEqual(internalUserPanelAccess(['team_tasks'], 'team_member'), []);
});
