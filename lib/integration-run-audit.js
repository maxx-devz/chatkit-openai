import 'server-only';
import { randomUUID } from 'node:crypto';

const safeName = /^[a-z][a-z0-9_]{0,63}$/;
const safeErrorCodes = new Set([
  'invalid_token', 'invalid_endpoint', 'identity_mismatch', 'hubstaff_unavailable',
  'hubstaff_forbidden', 'hubstaff_rate_limit', 'connection_unavailable',
  'connection_changed', 'refresh_limited',
]);

function count(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new TypeError('Audit count must be a nonnegative integer.');
  return value;
}

export function safeIntegrationErrorCode(error) {
  const code = error?.publicDetails?.code;
  return safeErrorCodes.has(code) ? code : 'unexpected_failure';
}

export async function startIntegrationRun(db, { source, operation, actorUserId = null,
  triggerType = 'request' }) {
  if (!safeName.test(source) || !safeName.test(operation)) throw new TypeError('Invalid integration audit name.');
  if (!['request', 'scheduled', 'manual', 'webhook'].includes(triggerType)) {
    throw new TypeError('Invalid integration audit trigger.');
  }
  const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
  if (!safeName.test(environment) || environment.length > 32) {
    throw new TypeError('Invalid integration audit environment.');
  }
  const requestId = randomUUID();
  const { rows } = await db.query(`INSERT INTO portal_integration_runs
    (source, operation, actor_user_id, environment, trigger_type, request_id)
    VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
  [source, operation, actorUserId, environment, triggerType, requestId]);
  return rows[0].id;
}

export async function finishIntegrationRun(db, id, { status, recordsProcessed = 0, retryCount = 0,
  recordsWritten = 0, recordsSkipped = 0, recordsFailed = 0,
  sourceTimestamp = null, errorCode = null } = {}) {
  if (!['succeeded', 'partial', 'failed'].includes(status)) throw new TypeError('Invalid integration audit status.');
  if (errorCode !== null && !safeName.test(errorCode)) throw new TypeError('Invalid integration audit error code.');
  const processed = count(recordsProcessed);
  const retries = count(retryCount);
  const retryState = retries === 0 ? 'none' : status === 'failed' ? 'exhausted' : 'recovered';
  const { rowCount } = await db.query(`UPDATE portal_integration_runs SET status=$2,
    records_processed=$3, retry_count=$4, source_timestamp=$5, error_code=$6,
    records_read=$7, records_written=$8, records_skipped=$9, records_failed=$10, retry_state=$11,
    finished_at=NOW() WHERE id=$1 AND status='running'`,
  [id, status, processed, retries, sourceTimestamp, errorCode, processed,
    count(recordsWritten), count(recordsSkipped), count(recordsFailed), retryState]);
  if (rowCount !== 1) throw new Error('Integration audit run was not open.');
}
