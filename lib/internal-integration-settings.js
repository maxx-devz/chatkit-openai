import 'server-only';

import { internalUserDatabase } from './internal-user-access.js';
import { requireInternalUserPermission } from './internal-user-data.js';
import { InternalUserError } from './internal-user-errors.js';
import { listActiveHubstaffMembers } from './internal-hubstaff-members.js';
import { auditInternalAction } from './internal-panel-audit.js';
import { finishIntegrationRun, safeIntegrationErrorCode, startIntegrationRun } from './integration-run-audit.js';

const PLANNED_INTEGRATIONS = Object.freeze([
  { id: 'hubspot', label: 'HubSpot' },
  { id: 'help_scout', label: 'Help Scout' },
  { id: 'google_drive', label: 'Google Drive' },
  { id: 'make', label: 'Make' },
]);

export function hubstaffIntegrationConfiguration(environment) {
  const tokenConfigured = typeof environment.HUBSTAFF_ACCESS_TOKEN === 'string'
    && environment.HUBSTAFF_ACCESS_TOKEN.trim().startsWith('hsoat_');
  const teamId = String(environment.HUBSTAFF_INTERNAL_TEAM_ID || '').trim();
  const teamConfigured = /^[1-9][0-9]*$/.test(teamId) && Number.isSafeInteger(Number(teamId));
  return {
    tokenConfigured,
    teamConfigured,
    teamId: teamConfigured ? teamId : null,
    schedulesVerified: environment.HUBSTAFF_TEAM_SCHEDULES_VERIFIED === 'true',
    status: tokenConfigured && teamConfigured ? 'ready_to_test' : 'setup_needed',
  };
}

export async function loadInternalIntegrationSettings(requestHeaders) {
  const { internalUser, profile } = await requireInternalUserPermission(requestHeaders, 'internal_users.read');
  const db = internalUserDatabase();
  const { rows } = await db.query("SELECT to_regclass('portal_integration_runs') AS runs");
  const auditReady = Boolean(rows[0]?.runs);
  let lastTest = null;
  if (auditReady) {
    const environment = process.env.VERCEL_ENV || process.env.NODE_ENV || 'unknown';
    const result = await db.query(`SELECT status, error_code, finished_at
      FROM portal_integration_runs WHERE source='hubstaff' AND operation='connection_test'
      AND environment=$1 AND status <> 'running' ORDER BY started_at DESC, id DESC LIMIT 1`, [environment]);
    const run = result.rows[0];
    if (run) lastTest = { status: run.status, errorCode: run.error_code,
      checkedAt: run.finished_at?.toISOString?.() || null };
  }
  await auditInternalAction(db, internalUser.user_id, 'integration_settings.read');
  return {
    hubstaff: { ...hubstaffIntegrationConfiguration(process.env), lastTest },
    planned: PLANNED_INTEGRATIONS,
    auditReady,
    canTest: auditReady && profile.roles.includes('internal_admin'),
  };
}

export async function testInternalHubstaffIntegration(requestHeaders) {
  const { internalUser, profile } = await requireInternalUserPermission(requestHeaders, 'internal_users.read');
  if (!profile.roles.includes('internal_admin')) {
    throw new InternalUserError('permission_forbidden', 'Only an Internal Admin can test organization connections.', 403);
  }
  const db = internalUserDatabase();
  const { rows } = await db.query("SELECT to_regclass('portal_integration_runs') AS runs");
  if (!rows[0]?.runs) {
    throw new InternalUserError('audit_unavailable', 'Apply the integration audit migration before testing connections.', 503);
  }
  const runId = await startIntegrationRun(db, {
    source: 'hubstaff', operation: 'connection_test', actorUserId: internalUser.user_id,
    triggerType: 'manual',
  });
  let members;
  try {
    // The existing directory reader verifies both the organization token and its AOC team scope.
    // Never return its member names or the token to the browser.
    members = await listActiveHubstaffMembers();
  } catch (error) {
    await finishIntegrationRun(db, runId, { status: 'failed', errorCode: safeIntegrationErrorCode(error) });
    throw new InternalUserError('integration_test_failed',
      'Hubstaff connection test failed. Check the organization token, AOC team ID, and audit log.', 503);
  }
  await finishIntegrationRun(db, runId, { status: 'succeeded', recordsProcessed: members.length });
  return loadInternalIntegrationSettings(requestHeaders);
}
