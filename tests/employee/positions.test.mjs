import assert from 'node:assert/strict';
import test from 'node:test';

import {
  employeeHasPanel,
  employeePanelAccess,
  employeePosition,
  EMPLOYEE_WORKSPACES,
  isEmployeePosition,
} from '../../lib/employee-positions.js';

test('employee positions provide stable default panel policies', () => {
  assert.equal(employeePosition('team_member').label, 'Team Member');
  assert.deepEqual(employeePanelAccess(undefined, 'team_member'), [
    'overview', 'my_tasks', 'activity', 'hubstaff',
  ]);
  assert.deepEqual(employeePanelAccess(undefined, 'project_manager'), [
    'overview', 'my_tasks', 'activity', 'team_directory', 'team_tasks', 'hubstaff',
  ]);
  assert.equal(isEmployeePosition('project_manager'), true);
  assert.equal(isEmployeePosition('invented_position'), false);
  assert.deepEqual(EMPLOYEE_WORKSPACES.map((workspace) => [workspace.label, workspace.path]), [
    ['My Work', '/employee'],
    ['Team Workspace', '/employee/team'],
    ['Settings', '/employee/settings'],
  ]);
});

test('custom panel access is allow-listed, ordered, and checked explicitly', () => {
  assert.deepEqual(
    employeePanelAccess(['hubstaff', 'unsupported', 'overview', 'overview'], 'team_member'),
    ['overview', 'hubstaff'],
  );
  assert.equal(employeeHasPanel({ position: 'project_manager' }, 'team_directory'), true);
  assert.equal(employeeHasPanel({ position: 'team_member' }, 'team_directory'), false);
  assert.equal(employeeHasPanel({ position: 'project_manager', panel_access: ['overview'] }, 'team_directory'), false);
});
