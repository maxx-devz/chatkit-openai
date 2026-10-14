import assert from 'node:assert/strict';
import test from 'node:test';
import { internalSettingsViewPolicy } from '../../lib/internal-settings-policy.js';

const user = (id, roles = [], active = true) => ({ id, roles, active });

test('internal admin can edit its own details but cannot pause its own account', () => {
  const policy = internalSettingsViewPolicy({ viewerId: '1', internalUser: user('1', ['internal_admin']),
    internalUsers: [user('1', ['internal_admin'])], canManageOwnAccount: true });
  assert.equal(policy.isSelf, true);
  assert.equal(policy.canEdit, true);
  assert.equal(policy.canChangeStatus, false);

  const manager = internalSettingsViewPolicy({ viewerId: '2', internalUser: user('2', ['internal_access_manager']),
    internalUsers: [user('2', ['internal_access_manager'])] });
  assert.equal(manager.canEdit, false);
  assert.equal(manager.canChangeStatus, false);
});

test('protected accounts cannot be paused through the UI, but other fields remain editable', () => {
  const manager = user('2', ['internal_access_manager']);
  const policy = internalSettingsViewPolicy({ viewerId: '1', internalUser: manager,
    internalUsers: [user('1', ['internal_admin']), manager] });
  assert.equal(policy.canEdit, true);
  assert.equal(policy.canChangeStatus, false);
  assert.equal(policy.isLastActiveManager, true);

  const inactive = internalSettingsViewPolicy({ viewerId: '1', internalUser: user('2', ['internal_admin'], false) });
  assert.equal(inactive.canChangeStatus, true);
});

test('last active manager is identified; ordinary users can be paused', () => {
  const managers = [user('2', ['internal_access_manager']), user('3', ['internal_access_manager'])];
  const policy = internalSettingsViewPolicy({ viewerId: '1', internalUser: managers[0],
    internalUsers: managers });
  assert.equal(policy.isLastActiveManager, false);
  assert.equal(policy.canChangeStatus, false);

  const ordinary = internalSettingsViewPolicy({ viewerId: '1', internalUser: user('4') });
  assert.equal(ordinary.canEdit, true);
  assert.equal(ordinary.canChangeStatus, true);

  const readOnly = internalSettingsViewPolicy({ viewerId: '1', internalUser: managers[0],
    internalUsers: managers, readOnly: true, canManageOwnAccount: true });
  assert.equal(readOnly.canEdit, false);
});
