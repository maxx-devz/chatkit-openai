import "server-only";
import { legacyBackfillInstalled } from "./legacy-agency-compat.js";
import { runBackgroundJob } from "./background-jobs.js";
import { randomUUID } from "node:crypto";
import { databasePool } from "./database.js";
import { DriveSourceError, driveConfiguration } from "./drive-source-policy.js";
import { driveConnectionStatus, discoverConnectedSources, previewConnectedSource } from "./drive-source-service.js";
import { sourceConnectionBinding } from "./drive-source-auto.js";
import { PREPARED_SOURCE_LIMITS } from "./prepared-source-policy.js";
import { decodePreparedDocuments, encodePreparedDocuments } from "./prepared-source-store.js";
import { prepareSourceDocuments } from "./prepared-source-sync-policy.js";
import { SOURCE_SEARCH_VERSION } from "./prepared-source-search.js";

export async function synchronizePreparedSources(ownerId, options = {}) {
  return runBackgroundJob("source",String(ownerId),{...options,manual:options.manual ?? true},job => synchronizeSourceBatch(ownerId,{signal:job.signal},job));
}
async function synchronizeSourceBatch(ownerId, { signal }, job) {
  const binding = sourceConnectionBinding(await driveConnectionStatus(ownerId), driveConfiguration().clientId);
  const token = randomUUID();
  const { rows } = await job.write(db => db.query({ text: `INSERT INTO portal_prepared_source_indexes(owner_id,lease_token,lease_until)
    VALUES($1,$2,NOW()+INTERVAL '150 seconds') ON CONFLICT(owner_id) DO UPDATE SET lease_token=$2,lease_until=EXCLUDED.lease_until
    WHERE (portal_prepared_source_indexes.lease_until IS NULL OR portal_prepared_source_indexes.lease_until<NOW())
      AND (portal_prepared_source_indexes.checked_at IS NULL OR portal_prepared_source_indexes.failure_code IS NOT NULL
        OR portal_prepared_source_indexes.binding IS DISTINCT FROM $3
        OR portal_prepared_source_indexes.sync_info->>'searchIndexVersion' IS DISTINCT FROM $4
        OR portal_prepared_source_indexes.checked_at<NOW()-INTERVAL '60 seconds') RETURNING *`,
  values: [ownerId, token, binding, String(SOURCE_SEARCH_VERSION)], query_timeout: 45_000 }));
  if (!rows[0]) return { skipped: true, message: "Sources were checked recently or a synchronization is already running." };
  try {
    const old = rows[0];
    let previous = [];
    let previousReadable = false;
    if (old.binding === binding && old.encrypted_documents) {
      try { previous = decodePreparedDocuments(old); previousReadable = true; } catch { /* Rebuild with the current authorized connection. */ }
    }
    await job.check();
    const inventory = await discoverConnectedSources(ownerId, { signal });
    await job.check();
    const prepared = await prepareSourceDocuments(inventory, previous,
      async (fileId, options) => { await job.check(); return previewConnectedSource(ownerId, fileId, options); }, signal);
    if (sourceConnectionBinding(await driveConnectionStatus(ownerId), driveConfiguration().clientId) !== binding) {
      throw new DriveSourceError("source_connection_changed", "The source connection changed during synchronization.", 409);
    }
    // A matching source revision cannot make unreadable ciphertext reusable.
    const unchanged = previousReadable && old.binding === binding && old.encrypted_documents
      && old.sync_info?.corpusRevision === prepared.sync.corpusRevision;
    const encrypted = unchanged ? null : encodePreparedDocuments(ownerId, binding, prepared.documents);
    const saved = await job.write(db => db.query({ text: `UPDATE portal_prepared_source_indexes SET binding=$3,encrypted_documents=COALESCE($4,encrypted_documents),
      directory=$5::jsonb,sync_info=$6::jsonb,checked_at=NOW(),failure_code=NULL,lease_token=NULL,lease_until=NULL
      WHERE owner_id=$1 AND lease_token=$2 AND lease_until>NOW() RETURNING owner_id`,
    values: [ownerId, token, binding, encrypted, JSON.stringify(inventory.files), JSON.stringify(prepared.sync)],
    query_timeout: 45_000 }));
    if (!saved.rows.length) throw new DriveSourceError("source_sync_lease_lost", "Another synchronization replaced this run. Retry.", 409);
    return { ready: true, ...prepared.sync };
  } catch (error) {
    // Fail closed instead of serving a previously readable corpus after a denied/partial check.
    await databasePool.query(`UPDATE portal_prepared_source_indexes SET failure_code=$3,lease_token=NULL,lease_until=NULL
      WHERE owner_id=$1 AND lease_token=$2`, [ownerId, token, error instanceof DriveSourceError ? error.code : "source_sync_failed"]);
    throw error;
  }
}

export async function synchronizeAllPreparedSources({ signal, budgetMs = 90_000, maxOwners = 3 } = {}) {
  const deadline = Date.now()+Math.min(100_000,Math.max(1,budgetMs));
  const adopted = await legacyBackfillInstalled(databasePool);
  const { rows } = adopted ? await databasePool.query("SELECT resource AS owner_id FROM agency_platform.job_candidates('source',$1)",[Math.max(1,Math.min(20,maxOwners))]) : await databasePool.query(`SELECT c.owner_id FROM portal_drive_source_connections c
    JOIN portal_admins a ON a.user_id=c.owner_id AND a.is_active=TRUE
    LEFT JOIN portal_prepared_source_indexes i ON i.owner_id=c.owner_id
    ORDER BY i.checked_at ASC NULLS FIRST,c.owner_id LIMIT $1`,[Math.max(1,Math.min(20,maxOwners))]);
  const results = [];
  for (const row of rows) {
    if (signal?.aborted || deadline-Date.now()<1000) break;
    try { results.push({ ownerId: String(row.owner_id), ...await synchronizePreparedSources(String(row.owner_id), { signal:AbortSignal.any([...(signal ? [signal] : []),AbortSignal.timeout(Math.min(85_000,Math.max(1,deadline-Date.now())))]),manual:false }) }); }
    catch (error) { results.push({ ownerId: String(row.owner_id), ready: false, code: error instanceof DriveSourceError ? error.code : "source_sync_failed" }); }
  }
  return { results, intervalSeconds: PREPARED_SOURCE_LIMITS.syncIntervalMilliseconds / 1000 };
}
