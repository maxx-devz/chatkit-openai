import 'server-only';

import { auth } from './auth.js';
import { databasePool } from './database.js';
import { requireInternalUserPermission, resolveInternalUserContext } from './internal-user-data.js';
import { InternalUserError } from './internal-user-errors.js';
import { canAccessInternalPanel } from './internal-panel-access.js';
import { passwordValidationMessage } from './input-validation.js';

function requireFields(input, fields) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== fields.length
    || fields.some(field => !Object.hasOwn(input, field) || typeof input[field] !== 'string')) {
    throw new InternalUserError('invalid_password_request', 'Provide only the required password fields.', 400);
  }
}

function requireNewPassword(password, username) {
  const message = passwordValidationMessage(password, username);
  if (message) throw new InternalUserError('invalid_new_password', message, 400);
}

function requireCurrentPassword(password) {
  if (!password || password.length > 128) {
    throw new InternalUserError('invalid_current_password', 'Enter your current password.', 400);
  }
}

export async function changeOwnInternalPassword(input, requestHeaders) {
  const { authUser, profile } = await resolveInternalUserContext(requestHeaders);
  if (!canAccessInternalPanel(profile, 'account_settings')) {
    throw new InternalUserError('panel_forbidden', 'Account Settings is not enabled for this account.', 403);
  }
  requireFields(input, ['currentPassword', 'newPassword']);
  requireCurrentPassword(input.currentPassword);
  requireNewPassword(input.newPassword, authUser.username);

  let authResponse;
  try {
    authResponse = await auth.api.changePassword({
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword,
        revokeOtherSessions: true },
      headers: requestHeaders,
      asResponse: true,
    });
  } catch {
    throw new InternalUserError('password_change_failed', 'Your password could not be changed. Try again.', 503);
  }
  if (!authResponse.ok) {
    if (authResponse.status === 429) {
      throw new InternalUserError('password_attempts_limited', 'Wait a moment before trying again.', 429);
    }
    const payload = await authResponse.json().catch(() => null);
    if (payload?.code === 'INVALID_PASSWORD') {
      throw new InternalUserError('invalid_current_password', 'Your current password is incorrect.', 400);
    }
    throw new InternalUserError('password_change_failed', 'Your password could not be changed. Try again.', 503);
  }

  const response = Response.json({ changed: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  for (const cookie of authResponse.headers.getSetCookie()) response.headers.append('Set-Cookie', cookie);
  return response;
}

export async function resetInternalUserPassword(input, requestHeaders) {
  const { internalUser } = await requireInternalUserPermission(requestHeaders, 'internal_users.password.reset');
  requireFields(input, ['id', 'currentPassword', 'newPassword']);
  if (!/^[1-9][0-9]{0,18}$/.test(input.id)
    || BigInt(input.id) > 9_223_372_036_854_775_807n) {
    throw new InternalUserError('invalid_internal_user_identifier', 'Select a valid internal user.', 400);
  }
  if (input.id === String(internalUser.user_id)) {
    throw new InternalUserError('self_reset_forbidden', 'Change your own password in personal Settings.', 403);
  }
  requireCurrentPassword(input.currentPassword);

  try {
    await auth.api.verifyPassword({ body: { password: input.currentPassword }, headers: requestHeaders });
  } catch (error) {
    if (error?.status === 429 || error?.statusCode === 429) {
      throw new InternalUserError('password_attempts_limited', 'Wait a moment before trying again.', 429);
    }
    throw new InternalUserError('invalid_current_password', 'Your current password is incorrect.', 400);
  }

  const context = await auth.$context;
  let client;
  try {
    client = await databasePool.connect();
    await client.query('BEGIN');
    await client.query('LOCK TABLE portal_internal_user_roles IN SHARE MODE');
    const actor = await client.query(`SELECT e.is_active,
      EXISTS(SELECT 1 FROM portal_internal_user_roles r WHERE r.user_id=e.user_id
        AND r.role_key='internal_admin') AS is_admin,
      EXISTS(SELECT 1 FROM portal_internal_user_roles r WHERE r.user_id=e.user_id
        AND r.role_key='internal_access_manager') AS is_manager
      FROM portal_internal_users e WHERE e.user_id=$1 FOR UPDATE`, [internalUser.user_id]);
    if (!actor.rows[0]?.is_active || (!actor.rows[0].is_admin && !actor.rows[0].is_manager)) {
      throw new InternalUserError('permission_forbidden', 'An active access-management role is required.', 403);
    }
    const target = await client.query(`SELECT e.user_id, auth_user.id AS auth_user_id, auth_user.username
      FROM portal_internal_users e JOIN portal_users portal_user ON portal_user.id=e.user_id
      JOIN "user" auth_user ON auth_user.id=portal_user.external_id
      WHERE e.user_id=$1 FOR UPDATE OF e`, [input.id]);
    if (!target.rows.length) {
      throw new InternalUserError('internal_user_not_found', 'The selected internal user no longer exists.', 404);
    }
    const targetRoles = await client.query(`SELECT role_key FROM portal_internal_user_roles WHERE user_id=$1`, [input.id]);
    if (!actor.rows[0].is_admin && targetRoles.rows.some(row =>
      row.role_key === 'internal_admin' || row.role_key === 'internal_access_manager')) {
      throw new InternalUserError('protected_account', 'This protected account cannot be reset with your access.', 403);
    }
    requireNewPassword(input.newPassword, target.rows[0].username);
    const passwordHash = await context.password.hash(input.newPassword);
    const changed = await client.query(`UPDATE "account" SET password=$1, "updatedAt"=NOW()
      WHERE "userId"=$2 AND "providerId"='credential' AND password IS NOT NULL`,
    [passwordHash, target.rows[0].auth_user_id]);
    if (changed.rowCount !== 1) {
      throw new InternalUserError('credential_unavailable', 'This internal user has no password login to reset.', 409);
    }
    await client.query('DELETE FROM "session" WHERE "userId"=$1', [target.rows[0].auth_user_id]);
    await client.query(`INSERT INTO portal_internal_access_audit(actor_user_id,target_user_id,action)
      VALUES($1,$2,'password.reset')`, [internalUser.user_id, input.id]);
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
  return { reset: true };
}
