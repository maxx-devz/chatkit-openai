import { createHmac } from 'node:crypto';
import { encryptHubstaffToken, decryptHubstaffToken } from './hubstaff-token-crypto.js';
import { InternalUserError } from './internal-user-errors.js';

// Keep this historical discriminator stable so tokens encrypted before the rename remain readable.
// A ciphertext still cannot be moved to another internal user's record.
function internalUserKey(secret, userId, hubstaffUserId) {
  if (typeof secret !== 'string' || secret.trim().length < 32) {
    throw new InternalUserError('connection_unavailable', 'Hubstaff connection storage needs administrator setup.');
  }
  return createHmac('sha256', secret.trim()).update(`aoc-employee-v1:${userId}:${hubstaffUserId}`).digest('hex');
}

export function encryptInternalUserToken(token, internalUser, secret) {
  return encryptHubstaffToken(token, internalUserKey(secret, internalUser.user_id, internalUser.hubstaff_user_id));
}

export function decryptInternalUserToken(internalUser, secret) {
  try {
    return decryptHubstaffToken(internalUser.encrypted_access_token, internalUserKey(secret, internalUser.user_id, internalUser.hubstaff_user_id));
  } catch {
    throw new InternalUserError('connection_unavailable', 'Your Hubstaff connection needs administrator attention.');
  }
}

export async function findInternalUser(db, externalId) {
  // Deploying this code before the optional migration preserves client/admin access.
  const exists = await db.query("SELECT to_regclass('portal_internal_users') AS relation");
  if (!exists.rows[0]?.relation) return null;
  const result = await db.query(`SELECT e.*, u.display_name
    FROM portal_internal_users e JOIN portal_users u ON u.id=e.user_id
    WHERE u.external_id=$1`, [externalId]);
  return result.rows[0] || null;
}

export function requireActiveInternalUser(internalUser) {
  if (!internalUser || internalUser.account_type !== 'internal_user' || internalUser.is_active !== true) {
    throw new InternalUserError('internal_user_required', 'This account does not have active internal user access.', 403);
  }
  return internalUser;
}

export async function claimInternalUserRequest(db, internalUser, { connecting = false } = {}) {
  const result = await db.query(`UPDATE portal_internal_users SET next_request_at=NOW()+INTERVAL '15 seconds'
    WHERE user_id=$1 AND is_active=TRUE AND hubstaff_user_id=$2 AND connection_version=$3
      AND ($4::boolean=FALSE OR encrypted_access_token IS NULL OR updated_at<=NOW()-INTERVAL '15 seconds')
      AND (next_request_at IS NULL OR next_request_at<=NOW()) RETURNING user_id`,
  [internalUser.user_id, internalUser.hubstaff_user_id, internalUser.connection_version, connecting]);
  if (!result.rowCount) throw new InternalUserError('refresh_limited', 'Please wait 15 seconds before trying again.', 429);
}

export async function saveInternalUserConnection(db, internalUser, encryptedToken, encryptedRefreshToken = null, expiresAt = null) {
  const result = await db.query(`UPDATE portal_internal_users
    SET encrypted_access_token=$4, encrypted_refresh_token=$5, access_expires_at=$6,
        connection_version=connection_version+1,
        last_synced_at=NULL, next_request_at=NULL, updated_at=NOW()
    WHERE user_id=$1 AND hubstaff_user_id=$2 AND connection_version=$3 AND is_active=TRUE
    RETURNING user_id`, [internalUser.user_id, internalUser.hubstaff_user_id, internalUser.connection_version,
    encryptedToken, encryptedRefreshToken, expiresAt]);
  if (!result.rowCount) throw new InternalUserError('connection_changed', 'Your access changed. Reload and try again.', 409);
}

export async function assertInternalUserTokenStore(db, internalUser) {
  try {
    await db.query(`SELECT encrypted_refresh_token, access_expires_at FROM portal_internal_users
      WHERE user_id=$1 AND hubstaff_user_id=$2 AND is_active=TRUE`,
    [internalUser.user_id, internalUser.hubstaff_user_id]);
  } catch (error) {
    if (error?.code === '42703') {
      throw new InternalUserError('connection_unavailable', 'The internal user token store needs its migration. Ask an administrator to run internal-user:migrate.');
    }
    throw error;
  }
}

export async function internalUserAccessToken(db, internalUser, secret, exchange, rejectedToken = '') {
  if (!internalUser.encrypted_refresh_token) return decryptInternalUserToken(internalUser, secret);
  if (!rejectedToken && new Date(internalUser.access_expires_at).valueOf() > Date.now() + 120_000) {
    return decryptInternalUserToken(internalUser, secret);
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT encrypted_access_token, encrypted_refresh_token,
      access_expires_at, connection_version FROM portal_internal_users
      WHERE user_id=$1 AND hubstaff_user_id=$2 AND is_active=TRUE FOR UPDATE`,
    [internalUser.user_id, internalUser.hubstaff_user_id]);
    const current = rows[0];
    if (!current || String(current.connection_version) !== String(internalUser.connection_version)) {
      throw new InternalUserError('connection_changed', 'Your access changed. Reload and try again.', 409);
    }
    const currentAccess = decryptInternalUserToken({ ...internalUser, ...current }, secret);
    if (new Date(current.access_expires_at).valueOf() > Date.now() + 120_000
      && (!rejectedToken || rejectedToken !== currentAccess)) {
      await client.query('COMMIT');
      return currentAccess;
    }
    const refreshToken = decryptHubstaffToken(current.encrypted_refresh_token,
      internalUserKey(secret, internalUser.user_id, internalUser.hubstaff_user_id));
    const rotated = await exchange(refreshToken);
    const saved = await client.query(`UPDATE portal_internal_users SET encrypted_access_token=$4,
      encrypted_refresh_token=$5, access_expires_at=$6, updated_at=NOW()
      WHERE user_id=$1 AND hubstaff_user_id=$2 AND connection_version=$3 AND is_active=TRUE`,
    [internalUser.user_id, internalUser.hubstaff_user_id, internalUser.connection_version,
      encryptInternalUserToken(rotated.accessToken, internalUser, secret),
      encryptInternalUserToken(rotated.refreshToken, internalUser, secret), rotated.expiresAt]);
    if (!saved.rowCount) throw new InternalUserError('connection_changed', 'Your access changed. Reload and try again.', 409);
    await client.query('COMMIT');
    return rotated.accessToken;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof InternalUserError) throw error;
    throw new InternalUserError('connection_unavailable', 'Your Hubstaff connection could not be refreshed. Please try again.');
  } finally { client.release(); }
}

export async function finishInternalUserSync(db, internalUser) {
  const result = await db.query(`UPDATE portal_internal_users SET last_synced_at=NOW()
    WHERE user_id=$1 AND hubstaff_user_id=$2 AND connection_version=$3 AND is_active=TRUE
    RETURNING last_synced_at`, [internalUser.user_id, internalUser.hubstaff_user_id, internalUser.connection_version]);
  if (!result.rowCount) throw new InternalUserError('connection_changed', 'Your access changed. Reload and try again.', 409);
  return new Date(result.rows[0].last_synced_at).toISOString();
}
