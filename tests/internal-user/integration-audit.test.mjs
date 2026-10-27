import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startIntegrationRun, finishIntegrationRun, safeIntegrationErrorCode } from '../../lib/integration-run-audit.js';

test('integration run keeps bounded operational fields and supports partial results', async () => {
  const calls = [];
  const db = { query: async (sql, values) => {
    calls.push({ sql, values });
    return sql.startsWith('INSERT') ? { rows: [{ id: 42 }] } : { rowCount: 1 };
  } };
  const id = await startIntegrationRun(db, { source: 'hubstaff', operation: 'internal_dashboard', actorUserId: 7 });
  assert.equal(id, 42);
  await finishIntegrationRun(db, id, { status: 'succeeded', recordsProcessed: 3, retryCount: 1 });
  assert.deepEqual(calls[0].values.slice(0, 3), ['hubstaff', 'internal_dashboard', 7]);
  assert.equal(calls[0].values[4], 'request');
  assert.match(calls[0].values[5], /^[0-9a-f-]{36}$/);
  assert.deepEqual(calls[1].values, [42, 'succeeded', 3, 1, null, null, 3, 0, 0, 0, 'recovered']);
  await finishIntegrationRun(db, id, { status: 'partial', recordsProcessed: 2, recordsSkipped: 1 });
  assert.deepEqual(calls[2].values, [42, 'partial', 2, 0, null, null, 2, 0, 1, 0, 'none']);
  await assert.rejects(startIntegrationRun(db, { source: 'hubstaff', operation: 'bad:op' }), TypeError);
  await assert.rejects(finishIntegrationRun(db, id, { status: 'succeeded', recordsProcessed: -1 }), TypeError);
});

test('integration errors store only allow-listed codes, never provider messages', () => {
  assert.equal(safeIntegrationErrorCode({ publicDetails: { code: 'hubstaff_rate_limit', message: 'secret' } }),
    'hubstaff_rate_limit');
  assert.equal(safeIntegrationErrorCode({ publicDetails: { code: 'token=secret' } }), 'unexpected_failure');
  assert.equal(safeIntegrationErrorCode({ publicDetails: { code: 'secret_token' } }), 'unexpected_failure');
  assert.equal(safeIntegrationErrorCode(new Error('secret=never-log')), 'unexpected_failure');
});
