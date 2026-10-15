import assert from 'node:assert/strict';
import test from 'node:test';
import { readInternalSyncFeed } from '../../lib/internal-sync-cache.js';
import { validSyncInterval } from '../../lib/internal-sync-feeds.js';

function fakeDatabase({ migrated = true } = {}) {
  const snapshots = new Map();
  const queries = [];
  return { snapshots, queries, intervalMinutes: null, async query(sql, values = []) {
    queries.push({ sql, values });
    if (sql.includes('to_regclass')) return { rows: [{ relation: migrated ? 'portal_internal_sync_snapshots' : null }] };
    if (sql.includes('SELECT interval_minutes')) return { rows: this.intervalMinutes == null
      ? [] : [{ interval_minutes: this.intervalMinutes }] };
    if (sql.includes('SELECT payload')) {
      const snapshot = snapshots.get(values[0]);
      return { rows: snapshot ? [{ ...snapshot,
        fresh: snapshot.refreshed_at > new Date(Date.now() - values[2] * 60_000) }] : [] };
    }
    if (sql.includes('INSERT INTO portal_internal_sync_snapshots')) {
      if (snapshots.has(values[0])) return { rowCount: 0 };
      snapshots.set(values[0], { payload: null, refreshed_at: null, expires_at: null,
        refresh_claim: values[2], refresh_until: new Date(Date.now() + 50_000) });
      return { rowCount: 1 };
    }
    if (sql.includes('UPDATE portal_internal_sync_snapshots SET payload')) {
      const snapshot = snapshots.get(values[0]);
      snapshot.payload = JSON.parse(values[2]);
      snapshot.refreshed_at = new Date();
      snapshot.expires_at = new Date(Date.now() + values[3] * 60_000);
      snapshot.refresh_claim = null;
      return { rowCount: 1 };
    }
    if (sql.includes('UPDATE portal_internal_sync_snapshots SET refresh_claim=NULL')) {
      const snapshot = snapshots.get(values[0]);
      if (snapshot?.refresh_claim === values[1]) snapshot.refresh_claim = null;
      return { rowCount: 1 };
    }
    if (sql.includes('DELETE FROM portal_internal_sync_snapshots')) return { rowCount: 0 };
    if (sql.includes('UPDATE portal_internal_sync_snapshots')) {
      const snapshot = snapshots.get(values[0]);
      if (snapshot.refresh_claim) return { rowCount: 0 };
      snapshot.refresh_claim = values[2];
      return { rowCount: 1 };
    }
    throw new Error(`Unexpected SQL: ${sql}`);
  } };
}

test('minute intervals are whole numbers within one day', () => {
  assert.equal(validSyncInterval(1), true);
  assert.equal(validSyncInterval(1440), true);
  for (const value of [0, 1.5, 1441, '15', NaN]) assert.equal(validSyncInterval(value), false);
});

test('shared snapshot is reused until expiry; forced refresh has a one-minute cooldown', async () => {
  const db = fakeDatabase();
  let calls = 0;
  const options = { feed: 'team_roster', scope: ['token-version', 'team-1'], loader: () => ({ calls: ++calls }) };
  assert.deepEqual(await readInternalSyncFeed(db, options), { calls: 1 });
  assert.deepEqual(await readInternalSyncFeed(db, options), { calls: 1 });
  assert.deepEqual(await readInternalSyncFeed(db, { ...options, force: true }), { calls: 1 });
  assert.equal(calls, 1);
  const snapshot = [...db.snapshots.values()][0];
  snapshot.refreshed_at = new Date(Date.now() - 61 * 60_000);
  snapshot.expires_at = new Date(Date.now() - 1);
  assert.deepEqual(await readInternalSyncFeed(db, options), { calls: 2 });
});

test('missing migration preserves live reads without writing cache tables', async () => {
  const db = fakeDatabase({ migrated: false });
  const result = await readInternalSyncFeed(db, {
    feed: 'personal_work', scope: ['user-1'], loader: () => ({ tasks: [] }),
  });
  assert.deepEqual(result, { tasks: [] });
  assert.equal(db.snapshots.size, 0);
});

test('changing minutes applies to existing snapshots on the next read', async () => {
  const db = fakeDatabase();
  let calls = 0;
  const options = { feed: 'hr_records', scope: ['2026-10'], loader: () => ({ calls: ++calls }) };
  assert.deepEqual(await readInternalSyncFeed(db, options), { calls: 1 });
  const snapshot = [...db.snapshots.values()][0];
  snapshot.refreshed_at = new Date(Date.now() - 10 * 60_000);
  db.intervalMinutes = 5;
  assert.deepEqual(await readInternalSyncFeed(db, options), { calls: 2 });
});

test('per-response freshness distinguishes a Hubstaff read from a saved database copy', async () => {
  const db = fakeDatabase();
  const options = { feed: 'team_roster', scope: ['org', 'aoc'], withMeta: true,
    loader: () => [{ id: '101', name: 'AOC member' }] };
  const first = await readInternalSyncFeed(db, options);
  const second = await readInternalSyncFeed(db, options);
  assert.deepEqual(first.value, second.value);
  assert.equal(first.freshness.source, 'hubstaff');
  assert.equal(second.freshness.source, 'cache');
  assert.ok(Number.isFinite(Date.parse(second.freshness.refreshedAt)));
  const forced = await readInternalSyncFeed(db, { ...options, force: true });
  assert.equal(forced.freshness.source, 'cache');
});
