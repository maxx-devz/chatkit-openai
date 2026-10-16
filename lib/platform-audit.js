import 'server-only';

import { databasePool } from './database.js';
import { resolveInternalUserContext } from './internal-user-data.js';
import { InternalUserError } from './internal-user-errors.js';
import { hasInternalPermission } from './internal-permissions.js';
import { auditInternalAction } from './internal-panel-audit.js';

const AUDIT_PAGE_SIZE = 20;

function auditPage(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || !/^[1-9]\d{0,5}$/.test(candidate)) return 1;
  return Math.min(Number(candidate), 100000);
}

function auditSnapshot(value) {
  const candidate = Array.isArray(value) ? value[0] : value;
  if (typeof candidate !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3,6}Z$/.test(candidate)) return null;
  const date = new Date(candidate);
  return Number.isNaN(date.getTime()) ? null : candidate;
}

export async function loadPlatformAudit(requestHeaders, options = {}) {
  const { profile, internalUser } = await resolveInternalUserContext(requestHeaders);
  if (!hasInternalPermission(profile, 'platform.audit.read')) {
    throw new InternalUserError('permission_forbidden', 'Audit log access is not enabled for this account.', 403);
  }
  const db = databasePool;
  const relations = await db.query(`SELECT to_regclass('portal_integration_runs') AS runs,
    to_regclass('portal_internal_access_audit') AS access_audit`);
  if (!relations.rows[0]?.runs || !relations.rows[0]?.access_audit) {
    throw new InternalUserError('audit_unavailable', 'Audit log migration is required.', 503);
  }
  const runsPage = auditPage(options.runsPage);
  const activityPage = auditPage(options.activityPage);
  const asOf = auditSnapshot(options.asOf)
    || (await db.query(`SELECT to_char(clock_timestamp() AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS audit_as_of`)).rows[0].audit_as_of;
  const [runs, actions] = await Promise.all([
    db.query(`SELECT id, source, operation, environment, trigger_type, request_id, actor_user_id,
      status, records_processed, records_read, records_written, records_skipped, records_failed,
      retry_count, retry_state, source_timestamp, source_window_start, source_window_end,
      error_code, started_at, finished_at
      FROM portal_integration_runs WHERE started_at <= $1
      ORDER BY started_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [asOf, AUDIT_PAGE_SIZE + 1, (runsPage - 1) * AUDIT_PAGE_SIZE]),
    db.query(`SELECT id, actor_user_id, target_user_id, action, occurred_at
      FROM portal_internal_access_audit WHERE occurred_at <= $1
      ORDER BY occurred_at DESC, id DESC LIMIT $2 OFFSET $3`,
    [asOf, AUDIT_PAGE_SIZE + 1, (activityPage - 1) * AUDIT_PAGE_SIZE]),
  ]);
  await auditInternalAction(db, internalUser.user_id, 'audit_log.read');
  return {
    integrationRuns: runs.rows.slice(0, AUDIT_PAGE_SIZE),
    accessEvents: actions.rows.slice(0, AUDIT_PAGE_SIZE),
    pagination: {
      asOf, pageSize: AUDIT_PAGE_SIZE,
      runsPage, runsHasMore: runs.rows.length > AUDIT_PAGE_SIZE,
      activityPage, activityHasMore: actions.rows.length > AUDIT_PAGE_SIZE,
    },
  };
}
