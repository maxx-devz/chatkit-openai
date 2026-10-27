import 'server-only';
import { internalUserDatabase } from './internal-user-access.js';
import { requireInternalUserPermission } from './internal-user-data.js';
import { InternalUserError } from './internal-user-errors.js';
import { INTERNAL_SYNC_FEEDS, internalSyncFeed, validSyncInterval } from './internal-sync-feeds.js';
import { internalSyncSchemaReady } from './internal-sync-cache.js';

export async function loadInternalSyncSettings(requestHeaders) {
  const { profile } = await requireInternalUserPermission(requestHeaders, 'internal_users.read');
  const db = internalUserDatabase();
  const schemaReady = await internalSyncSchemaReady(db);
  const canEdit = profile.roles.includes('internal_admin');
  if (!schemaReady) return { schemaReady, canEdit, feeds: INTERNAL_SYNC_FEEDS.map(feed => ({
    ...feed, intervalMinutes: feed.defaultMinutes, lastRefreshedAt: null,
  })) };
  const [settings, health] = await Promise.all([
    db.query('SELECT feed_key, interval_minutes FROM portal_internal_sync_settings'),
    db.query(`SELECT feed_key, MAX(refreshed_at) AS last_refreshed_at
      FROM portal_internal_sync_snapshots WHERE refreshed_at IS NOT NULL GROUP BY feed_key`),
  ]);
  const values = new Map(settings.rows.map(row => [row.feed_key, Number(row.interval_minutes)]));
  const times = new Map(health.rows.map(row => [row.feed_key, row.last_refreshed_at]));
  return { schemaReady, canEdit, feeds: INTERNAL_SYNC_FEEDS.map(feed => ({
    ...feed, intervalMinutes: validSyncInterval(values.get(feed.id)) ? values.get(feed.id) : feed.defaultMinutes,
    lastRefreshedAt: times.get(feed.id)?.toISOString?.() || null,
  })) };
}

export async function updateInternalSyncSetting(requestHeaders, input) {
  const { internalUser, profile } = await requireInternalUserPermission(requestHeaders, 'internal_users.read');
  if (!profile.roles.includes('internal_admin')) {
    throw new InternalUserError('permission_forbidden', 'Your account cannot change sync intervals.', 403);
  }
  if (!input || Object.keys(input).sort().join(',') !== 'feed,intervalMinutes'
    || !internalSyncFeed(input.feed) || !validSyncInterval(input.intervalMinutes)) {
    throw new InternalUserError('invalid_request', 'Choose a feed and an interval of 1 to 1440 whole minutes.', 400);
  }
  const db = internalUserDatabase();
  if (!await internalSyncSchemaReady(db)) {
    throw new InternalUserError('sync_settings_unavailable', 'Apply the internal sync migration first.', 503);
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    // Serialize concurrent edits, including the first write for a feed.
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`portal_internal_sync_settings:${input.feed}`]);
    const { rows } = await client.query('SELECT interval_minutes FROM portal_internal_sync_settings WHERE feed_key=$1', [input.feed]);
    const oldMinutes = Number(rows[0]?.interval_minutes) || internalSyncFeed(input.feed).defaultMinutes;
    if (oldMinutes !== input.intervalMinutes) {
      await client.query(`INSERT INTO portal_internal_sync_settings
        (feed_key, interval_minutes, updated_by, updated_at) VALUES ($1,$2,$3,NOW())
        ON CONFLICT (feed_key) DO UPDATE SET interval_minutes=EXCLUDED.interval_minutes,
          updated_by=EXCLUDED.updated_by, updated_at=NOW()`,
      [input.feed, input.intervalMinutes, internalUser.user_id]);
      await client.query(`INSERT INTO portal_internal_sync_settings_audit
        (feed_key, old_minutes, new_minutes, actor_user_id) VALUES ($1,$2,$3,$4)`,
      [input.feed, oldMinutes, input.intervalMinutes, internalUser.user_id]);
      await client.query(`INSERT INTO portal_internal_access_audit
        (actor_user_id, target_user_id, action) VALUES ($1,NULL,$2)`,
      [internalUser.user_id, `sync_interval.update:${input.feed}:${oldMinutes}->${input.intervalMinutes}`]);
    }
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); }
  return loadInternalSyncSettings(requestHeaders);
}
