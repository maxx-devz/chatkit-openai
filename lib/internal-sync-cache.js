import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { internalSyncFeed, validSyncInterval } from './internal-sync-feeds.js';

const LEASE_SECONDS = 50;
const WAIT_MS = 45_000;

export async function internalSyncSchemaReady(db) {
  const { rows } = await db.query("SELECT to_regclass('portal_internal_sync_snapshots') AS relation");
  return rows[0]?.relation === 'portal_internal_sync_snapshots';
}

export async function configuredSyncMinutes(db, feed) {
  const definition = internalSyncFeed(feed);
  if (!definition) throw new Error('Unknown internal sync feed.');
  const { rows } = await db.query('SELECT interval_minutes FROM portal_internal_sync_settings WHERE feed_key=$1', [feed]);
  const minutes = Number(rows[0]?.interval_minutes);
  return validSyncInterval(minutes) ? minutes : definition.defaultMinutes;
}

function snapshotKey(feed, scope) {
  return createHash('sha256').update(JSON.stringify([feed, scope])).digest('hex');
}

async function readSnapshot(db, key, feed, minutes) {
  const { rows } = await db.query(`SELECT payload, refreshed_at, expires_at, refresh_claim, refresh_until,
    refreshed_at > NOW()-($3 * INTERVAL '1 minute') AS fresh FROM portal_internal_sync_snapshots
    WHERE cache_key=$1 AND feed_key=$2`, [key, feed, minutes]);
  return rows[0] || null;
}

const pause = ms => new Promise(resolve => setTimeout(resolve, ms));

function delivered(value, withMeta, source, refreshedAt) {
  return withMeta ? { value, freshness: { source,
    refreshedAt: new Date(refreshedAt).toISOString() } } : value;
}

export async function readInternalSyncFeed(db, { feed, scope, loader, force = false, withMeta = false }) {
  if (!internalSyncFeed(feed)) throw new Error('Unknown internal sync feed.');
  // Existing installations continue to work until the versioned migration is applied.
  if (!await internalSyncSchemaReady(db)) {
    const value = await loader();
    return delivered(value, withMeta, 'hubstaff', new Date());
  }
  const key = snapshotKey(feed, scope);
  const minutes = await configuredSyncMinutes(db, feed);
  let snapshot = await readSnapshot(db, key, feed, minutes);
  const recent = snapshot?.refreshed_at && Date.now() - new Date(snapshot.refreshed_at).valueOf() < 60_000;
  if (snapshot?.payload != null && snapshot.fresh && !force) {
    return delivered(snapshot.payload, withMeta, 'cache', snapshot.refreshed_at);
  }
  if (force && recent && snapshot?.payload != null) {
    return delivered(snapshot.payload, withMeta, 'cache', snapshot.refreshed_at);
  }

  const claim = randomUUID();
  let claimed;
  if (!snapshot) {
    const result = await db.query(`INSERT INTO portal_internal_sync_snapshots
      (cache_key, feed_key, refresh_claim, refresh_until)
      VALUES ($1,$2,$3,NOW()+($4 * INTERVAL '1 second'))
      ON CONFLICT DO NOTHING RETURNING cache_key`, [key, feed, claim, LEASE_SECONDS]);
    claimed = result.rowCount > 0;
  } else {
    const result = await db.query(`UPDATE portal_internal_sync_snapshots
      SET refresh_claim=$3, refresh_until=NOW()+($4 * INTERVAL '1 second')
      WHERE cache_key=$1 AND feed_key=$2
        AND (refresh_claim IS NULL OR refresh_until < NOW()) RETURNING cache_key`,
    [key, feed, claim, LEASE_SECONDS]);
    claimed = result.rowCount > 0;
  }
  if (claimed) {
    try {
      const payload = await loader();
      const serialized = JSON.stringify(payload);
      // Avoid unexpectedly persisting unbounded provider responses.
      if (Buffer.byteLength(serialized, 'utf8') > 2_000_000) {
        return delivered(payload, withMeta, 'hubstaff', new Date());
      }
      await db.query(`UPDATE portal_internal_sync_snapshots SET payload=$3::jsonb,
        refreshed_at=NOW(), expires_at=NOW()+($4 * INTERVAL '1 minute'),
        refresh_claim=NULL, refresh_until=NULL
        WHERE cache_key=$1 AND refresh_claim=$2`, [key, claim, serialized, minutes]);
      // A new successful refresh also prunes old snapshots (including retired token scopes).
      await db.query(`DELETE FROM portal_internal_sync_snapshots
        WHERE expires_at < NOW()-INTERVAL '7 days' AND refresh_claim IS NULL`).catch(() => {});
      return delivered(payload, withMeta, 'hubstaff', new Date());
    } finally {
      await db.query(`UPDATE portal_internal_sync_snapshots SET refresh_claim=NULL, refresh_until=NULL
        WHERE cache_key=$1 AND refresh_claim=$2`, [key, claim]).catch(() => {});
    }
  }
  // Another request is fetching this same feed. Wait for its finished snapshot.
  const until = Date.now() + WAIT_MS;
  while (Date.now() < until) {
    await pause(500);
    snapshot = await readSnapshot(db, key, feed, minutes);
    if (snapshot?.payload != null && snapshot.fresh && !snapshot.refresh_claim) {
      return delivered(snapshot.payload, withMeta, 'cache', snapshot.refreshed_at);
    }
    if (!snapshot?.refresh_claim || snapshot.refresh_until && new Date(snapshot.refresh_until) < new Date()) break;
  }
  // A failed or timed-out leader must not silently serve stale HR/personnel data.
  throw new Error('The data refresh is still in progress. Please try again shortly.');
}
