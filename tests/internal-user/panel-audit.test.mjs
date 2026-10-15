import assert from 'node:assert/strict';
import test from 'node:test';

import { auditInternalPanelReads, auditInternalRoleView, auditInternalAction } from '../../lib/internal-panel-audit.js';

test('panel audit writes controlled per-panel actions without content or duplicate names', async () => {
  const calls = [];
  const db = { query: async (sql, values) => { calls.push({ sql, values }); return { rowCount: 2 }; } };
  await auditInternalPanelReads(db, '17', ['overview', 'my_tasks', 'overview']);
  assert.equal(calls.length, 1);
  assert.match(calls[0].sql, /panel\.read\./);
  assert.deepEqual(calls[0].values, ['17', ['overview', 'my_tasks']]);
  await assert.rejects(auditInternalPanelReads(db, '17', ['invented_panel']), TypeError);
  assert.equal(calls.length, 1);
});

test('role and privileged-page audit actions are allow-listed', async () => {
  const calls = [];
  const db = { query: async (_sql, values) => { calls.push(values); return { rowCount: 1 }; } };
  await auditInternalRoleView(db, '17', 'sales');
  await auditInternalAction(db, '17', 'audit_log.read');
  assert.deepEqual(calls, [['17', 'role.view.sales'], ['17', 'audit_log.read']]);
  await assert.rejects(auditInternalRoleView(db, '17', 'internal_admin'), TypeError);
  await assert.rejects(auditInternalAction(db, '17', 'password.reset'), TypeError);
});
