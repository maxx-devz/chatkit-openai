import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

let clientAuthorized = true;
let adminAuthorized = true;
const queries = [];
const db = { async query(sql, values = []) {
  queries.push({ sql, values });
  if (sql.includes('FROM portal_clients ORDER BY display_name')) {
    return { rows: [{ id: '10', display_name: 'Client Ten' }] };
  }
  return { rows: [] };
} };

mock.module('../../lib/database.js', { namedExports: { databasePool: db } });
mock.module('../../lib/portal-data.js', { namedExports: {
  requireClientPermission: async (_headers, permission) => {
    assert.equal(permission, 'client.access_audit.read');
    if (!clientAuthorized) throw Object.assign(new Error('Forbidden'), { status: 403 });
    return { client: { id: '10' }, user: { id: '20' } };
  },
} });
mock.module('../../lib/admin-data.js', { namedExports: {
  resolveAdminContext: async () => {
    if (!adminAuthorized) throw Object.assign(new Error('Forbidden'), { status: 403 });
    return { admin: { id: '30' } };
  },
} });

const { loadClientAudit, loadAocAdminAudit } = await import('../../lib/admin-audit-data.js');
const { recordAiUsageEvent } = await import('../../lib/portal-audit.js');

test('client audit requires client-admin permission before reading any rows', async () => {
  queries.length = 0;
  clientAuthorized = false;
  await assert.rejects(loadClientAudit(new Headers()), /Forbidden/);
  assert.equal(queries.length, 0);
  clientAuthorized = true;
});

test('client activity and AI usage queries are both scoped to the authenticated client', async () => {
  queries.length = 0;
  const result = await loadClientAudit(new Headers(), { eventPage: '2', usagePage: '3' });
  assert.equal(result.pagination.eventPage, 2);
  assert.equal(result.pagination.usagePage, 3);
  assert.equal(queries.length, 3);
  for (const query of queries.slice(0, 2)) {
    assert.equal(query.values[0], '10');
    assert.match(query.sql, /client_id=\$1/);
  }
  assert.match(queries[1].sql, /u\.action='client_ai\.reply'/);
  assert.deepEqual(queries[2].values.slice(0, 5), ['client', '10', '20', 'client.audit.read', 'audit']);
});

test('AOC audit requires administrator access and filters all result sets by client', async () => {
  queries.length = 0;
  adminAuthorized = false;
  await assert.rejects(loadAocAdminAudit(new Headers()), /Forbidden/);
  assert.equal(queries.length, 0);
  adminAuthorized = true;
  const result = await loadAocAdminAudit(new Headers(), { clientId: '10' });
  assert.equal(result.pagination.clientId, '10');
  assert.equal(queries.length, 5);
  for (const query of queries.slice(1, 4)) {
    assert.equal(query.values[1], '10');
    assert.match(query.sql, /\$2::bigint IS NULL/);
  }
  assert.match(queries[2].sql, /portal_area IN \('aoc_admin','client_portal'\)/);
});

test('AOC client filter rejects values outside signed PostgreSQL BIGINT', async () => {
  queries.length = 0;
  const result = await loadAocAdminAudit(new Headers(), { clientId: '9223372036854775808' });
  assert.equal(result.pagination.clientId, null);
  assert.equal(queries[1].values[1], null);
});

test('AI token ledger uses one request ID and leaves unreported usage unknown', async () => {
  queries.length = 0;
  await recordAiUsageEvent(db, { requestId: 'fc4c1d61-c4cd-4292-bc10-2df773898add',
    clientId: '10', actorUserId: '20', action: 'client_ai.reply', status: 'failed',
    startedAt: '2026-10-20T00:00:00.000Z' });
  assert.match(queries[0].sql, /ON CONFLICT\(request_id\) DO NOTHING/);
  assert.deepEqual(queries[0].values.slice(7, 10), [null, null, null]);
  await assert.rejects(recordAiUsageEvent(db, { actorUserId: '20', action: 'client_ai.reply',
    status: 'succeeded', startedAt: '2026-10-20T00:00:00.000Z' }), /Invalid AI usage event/);
});
