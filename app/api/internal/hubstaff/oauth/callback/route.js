import { resolveInternalUserContext } from '@/lib/internal-user-data';
import { internalUserDatabase } from '@/lib/internal-user-access';
import { canAccessInternalPanel } from '@/lib/internal-panel-access';
import { hasInternalPermission } from '@/lib/internal-permissions';
import { InternalUserError } from '@/lib/internal-user-errors';
import { createInternalUserHubstaff } from '@/lib/internal-user-hubstaff';
import { claimInternalUserRequest, encryptInternalUserToken, saveInternalUserConnection } from '@/lib/internal-user-repository';
import { exchangeInternalHubstaffOAuthCode, internalHubstaffOAuthConfig,
  internalHubstaffOAuthCookieHeader, readInternalHubstaffOAuthAttempt,
  readInternalHubstaffOAuthCookie } from '@/lib/internal-hubstaff-oauth';
import { finishIntegrationRun, safeIntegrationErrorCode, startIntegrationRun } from '@/lib/integration-run-audit';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

function finish(code, path = '/internal/settings') {
  const location = path === '/login' ? '/login' : `${path}?connection=${encodeURIComponent(code)}`;
  return new Response(null, { status: 303, headers: {
    Location: location,
    'Set-Cookie': internalHubstaffOAuthCookieHeader('', { clear: true }),
    'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer',
  } });
}

export async function GET(request) {
  let runId;
  let db;
  try {
    const { internalUser, profile, authSessionId } = await resolveInternalUserContext(request.headers);
    if (!canAccessInternalPanel(profile, 'hubstaff')
      || !hasInternalPermission(profile, 'hubstaff.connection.manage')) {
      throw new InternalUserError('panel_forbidden', 'Hubstaff connection access is not enabled.', 403);
    }
    const config = internalHubstaffOAuthConfig();
    const url = new URL(request.url);
    const attempt = readInternalHubstaffOAuthAttempt(config, {
      cookie: readInternalHubstaffOAuthCookie(request.headers), state: url.searchParams.get('state'),
      userId: internalUser.user_id, sessionId: authSessionId,
      hubstaffUserId: internalUser.hubstaff_user_id, connectionVersion: internalUser.connection_version,
    });
    if (url.searchParams.has('error')) return finish('oauth_denied');
    const code = url.searchParams.get('code');
    db = internalUserDatabase();
    await claimInternalUserRequest(db, internalUser, { connecting: true });
    runId = await startIntegrationRun(db, {
      source: 'hubstaff', operation: 'oauth_connection', actorUserId: internalUser.user_id,
      triggerType: 'manual',
    });
    const tokens = await exchangeInternalHubstaffOAuthCode(config, code, attempt.verifier);
    const result = await createInternalUserHubstaff().dashboard(tokens.accessToken, internalUser.hubstaff_user_id);
    const client = await db.connect();
    try {
      await client.query('BEGIN');
      await saveInternalUserConnection(client, internalUser,
        encryptInternalUserToken(tokens.accessToken, internalUser, config.secret),
        encryptInternalUserToken(tokens.refreshToken, internalUser, config.secret),
        tokens.expiresAt, 'oauth');
      await client.query(`INSERT INTO portal_internal_access_audit(actor_user_id,target_user_id,action)
        VALUES($1,$1,'hubstaff.oauth.connect')`, [internalUser.user_id]);
      await finishIntegrationRun(client, runId, { status: result.truncated ? 'partial' : 'succeeded',
        recordsProcessed: (result.tasks?.length || 0) + (result.projects?.length || 0) });
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
    return finish('connected');
  } catch (error) {
    if (runId && db) {
      await finishIntegrationRun(db, runId, { status: 'failed', errorCode: safeIntegrationErrorCode(error) })
        .catch(() => {});
    }
    if (error instanceof InternalUserError) {
      if (error.publicDetails.code === 'authentication_required') return finish('oauth_expired', '/login');
      return finish(error.publicDetails.code);
    }
    return finish('oauth_unavailable');
  }
}
