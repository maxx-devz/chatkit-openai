import "server-only";
import { randomUUID } from "node:crypto";
import { databasePool } from "./database.js";
import { DriveSourceError, driveConfiguration } from "./drive-source-policy.js";
import { driveConnectionStatus, discoverConnectedSources, previewConnectedSource } from "./drive-source-service.js";
import { sourceConnectionBinding } from "./drive-source-auto.js";
import { PREPARED_SOURCE_LIMITS } from "./prepared-source-policy.js";
import { decodePreparedDocuments, encodePreparedDocuments } from "./prepared-source-store.js";
import { prepareSourceDocuments } from "./prepared-source-sync-policy.js";

export async function synchronizePreparedSources(ownerId, { signal } = {}) {
  const binding = sourceConnectionBinding(await driveConnectionStatus(ownerId), driveConfiguration().clientId);
  const token = randomUUID();
  const { rows } = await databasePool.query(`INSERT INTO portal_prepared_source_indexes(owner_id,lease_token,lease_until)
    VALUES($1,$2,NOW()+INTERVAL '150 seconds') ON CONFLICT(owner_id) DO UPDATE SET lease_token=$2,lease_until=EXCLUDED.lease_until
    WHERE (portal_prepared_source_indexes.lease_until IS NULL OR portal_prepared_source_indexes.lease_until<NOW())
      AND (portal_prepared_source_indexes.checked_at IS NULL OR portal_prepared_source_indexes.failure_code IS NOT NULL
        OR portal_prepared_source_indexes.binding IS DISTINCT FROM $3
        OR portal_prepared_source_indexes.checked_at<NOW()-INTERVAL '60 seconds') RETURNING *`, [ownerId, token, binding]);
  if (!rows[0]) return { skipped: true, message: "Sources were checked recently or a synchronization is already running." };
  try {
    const old = rows[0];
    let previous = [];
    if (old.binding === binding && old.encrypted_documents) {
      try { previous = decodePreparedDocuments(old); } catch { /* Rebuild with the current authorized connection. */ }
    }
    const inventory = await discoverConnectedSources(ownerId, { signal });
    const prepared = await prepareSourceDocuments(inventory, previous,
      (fileId, options) => previewConnectedSource(ownerId, fileId, options), signal);
    if (sourceConnectionBinding(await driveConnectionStatus(ownerId), driveConfiguration().clientId) !== binding) {
      throw new DriveSourceError("source_connection_changed", "The source connection changed during synchronization.", 409);
    }
    const encrypted = encodePreparedDocuments(ownerId, binding, prepared.documents);
    const saved = await databasePool.query(`UPDATE portal_prepared_source_indexes SET binding=$3,encrypted_documents=$4,
      directory=$5::jsonb,sync_info=$6::jsonb,checked_at=NOW(),failure_code=NULL,lease_token=NULL,lease_until=NULL
      WHERE owner_id=$1 AND lease_token=$2 RETURNING owner_id`,
    [ownerId, token, binding, encrypted, JSON.stringify(inventory.files), JSON.stringify(prepared.sync)]);
    if (!saved.rows.length) throw new DriveSourceError("source_sync_lease_lost", "Another synchronization replaced this run. Retry.", 409);
    return { ready: true, ...prepared.sync };
  } catch (error) {
    // Fail closed instead of serving a previously readable corpus after a denied/partial check.
    await databasePool.query(`UPDATE portal_prepared_source_indexes SET failure_code=$3,lease_token=NULL,lease_until=NULL
      WHERE owner_id=$1 AND lease_token=$2`, [ownerId, token, error instanceof DriveSourceError ? error.code : "source_sync_failed"]);
    throw error;
  }
}

export async function synchronizeAllPreparedSources({ signal } = {}) {
  const { rows } = await databasePool.query(`SELECT c.owner_id FROM portal_drive_source_connections c
    JOIN portal_admins a ON a.user_id=c.owner_id AND a.is_active=TRUE ORDER BY c.owner_id LIMIT 20`);
  const results = [];
  for (const row of rows) {
    signal?.throwIfAborted();
    try { results.push({ ownerId: String(row.owner_id), ...await synchronizePreparedSources(String(row.owner_id), { signal }) }); }
    catch (error) { results.push({ ownerId: String(row.owner_id), ready: false, code: error instanceof DriveSourceError ? error.code : "source_sync_failed" }); }
  }
  return { results, intervalSeconds: PREPARED_SOURCE_LIMITS.syncIntervalMilliseconds / 1000 };
}
