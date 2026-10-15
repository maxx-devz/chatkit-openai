import 'server-only';

import { databasePool } from './database.js';
import { resolveInternalUserContext } from './internal-user-data.js';
import { InternalUserError } from './internal-user-errors.js';
import { hasInternalPermission } from './internal-permissions.js';
import { auditInternalAction } from './internal-panel-audit.js';

export async function loadPlatformAudit(requestHeaders) {
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
  const [runs, actions] = await Promise.all([
    db.query(`SELECT id, source, operation, environment, trigger_type, request_id, actor_user_id,
      status, records_processed, records_read, records_written, records_skipped, records_failed,
      retry_count, retry_state, source_timestamp, source_window_start, source_window_end,
      error_code, started_at, finished_at
      FROM portal_integration_runs ORDER BY started_at DESC, id DESC LIMIT 30`),
    db.query(`SELECT id, actor_user_id, target_user_id, action, occurred_at
      FROM portal_internal_access_audit ORDER BY occurred_at DESC, id DESC LIMIT 30`),
  ]);
  await auditInternalAction(db, internalUser.user_id, 'audit_log.read');
  return { integrationRuns: runs.rows, accessEvents: actions.rows };
}
