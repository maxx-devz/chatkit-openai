import { createHmac } from 'node:crypto';
import { encryptHubstaffToken, decryptHubstaffToken } from './hubstaff-token-crypto.js';
import { EmployeeError } from './employee-errors.js';

// An employee ciphertext cannot be moved to another employee's record.
function employeeKey(secret, userId, hubstaffUserId) {
  if (typeof secret !== 'string' || secret.trim().length < 32) {
    throw new EmployeeError('connection_unavailable', 'Hubstaff connection storage needs administrator setup.');
  }
  return createHmac('sha256', secret.trim()).update(`aoc-employee-v1:${userId}:${hubstaffUserId}`).digest('hex');
}

export function encryptEmployeeToken(token, employee, secret) {
  return encryptHubstaffToken(token, employeeKey(secret, employee.user_id, employee.hubstaff_user_id));
}

export function decryptEmployeeToken(employee, secret) {
  try {
    return decryptHubstaffToken(employee.encrypted_access_token, employeeKey(secret, employee.user_id, employee.hubstaff_user_id));
  } catch {
    throw new EmployeeError('connection_unavailable', 'Your Hubstaff connection needs administrator attention.');
  }
}

export async function findEmployee(db, externalId) {
  // Deploying this code before the optional migration preserves client/admin access.
  const exists = await db.query("SELECT to_regclass('portal_employees') AS relation");
  if (!exists.rows[0]?.relation) return null;
  const result = await db.query(`SELECT e.*, u.display_name
    FROM portal_employees e JOIN portal_users u ON u.id=e.user_id
    WHERE u.external_id=$1`, [externalId]);
  return result.rows[0] || null;
}

export function requireActiveEmployee(employee) {
  if (!employee || employee.role !== 'employee' || employee.is_active !== true) {
    throw new EmployeeError('employee_required', 'This account does not have active employee access.', 403);
  }
  return employee;
}

export async function claimEmployeeRequest(db, employee, { connecting = false } = {}) {
  const result = await db.query(`UPDATE portal_employees SET next_request_at=NOW()+INTERVAL '15 seconds'
    WHERE user_id=$1 AND is_active=TRUE AND hubstaff_user_id=$2 AND connection_version=$3
      AND ($4::boolean=FALSE OR encrypted_access_token IS NULL OR updated_at<=NOW()-INTERVAL '15 seconds')
      AND (next_request_at IS NULL OR next_request_at<=NOW()) RETURNING user_id`,
  [employee.user_id, employee.hubstaff_user_id, employee.connection_version, connecting]);
  if (!result.rowCount) throw new EmployeeError('refresh_limited', 'Please wait 15 seconds before trying again.', 429);
}

export async function saveEmployeeConnection(db, employee, encryptedToken, encryptedRefreshToken = null, expiresAt = null) {
  const result = await db.query(`UPDATE portal_employees
    SET encrypted_access_token=$4, encrypted_refresh_token=$5, access_expires_at=$6,
        connection_version=connection_version+1,
        last_synced_at=NULL, next_request_at=NULL, updated_at=NOW()
    WHERE user_id=$1 AND hubstaff_user_id=$2 AND connection_version=$3 AND is_active=TRUE
    RETURNING user_id`, [employee.user_id, employee.hubstaff_user_id, employee.connection_version,
    encryptedToken, encryptedRefreshToken, expiresAt]);
  if (!result.rowCount) throw new EmployeeError('connection_changed', 'Your access changed. Reload and try again.', 409);
}

export async function assertEmployeeTokenStore(db, employee) {
  try {
    await db.query(`SELECT encrypted_refresh_token, access_expires_at FROM portal_employees
      WHERE user_id=$1 AND hubstaff_user_id=$2 AND is_active=TRUE`,
    [employee.user_id, employee.hubstaff_user_id]);
  } catch (error) {
    if (error?.code === '42703') {
      throw new EmployeeError('connection_unavailable', 'The employee token store needs its migration. Ask an administrator to run employee:migrate.');
    }
    throw error;
  }
}

export async function employeeAccessToken(db, employee, secret, exchange, rejectedToken = '') {
  if (!employee.encrypted_refresh_token) return decryptEmployeeToken(employee, secret);
  if (!rejectedToken && new Date(employee.access_expires_at).valueOf() > Date.now() + 120_000) {
    return decryptEmployeeToken(employee, secret);
  }
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows } = await client.query(`SELECT encrypted_access_token, encrypted_refresh_token,
      access_expires_at, connection_version FROM portal_employees
      WHERE user_id=$1 AND hubstaff_user_id=$2 AND is_active=TRUE FOR UPDATE`,
    [employee.user_id, employee.hubstaff_user_id]);
    const current = rows[0];
    if (!current || String(current.connection_version) !== String(employee.connection_version)) {
      throw new EmployeeError('connection_changed', 'Your access changed. Reload and try again.', 409);
    }
    const currentAccess = decryptEmployeeToken({ ...employee, ...current }, secret);
    if (new Date(current.access_expires_at).valueOf() > Date.now() + 120_000
      && (!rejectedToken || rejectedToken !== currentAccess)) {
      await client.query('COMMIT');
      return currentAccess;
    }
    const refreshToken = decryptHubstaffToken(current.encrypted_refresh_token,
      employeeKey(secret, employee.user_id, employee.hubstaff_user_id));
    const rotated = await exchange(refreshToken);
    const saved = await client.query(`UPDATE portal_employees SET encrypted_access_token=$4,
      encrypted_refresh_token=$5, access_expires_at=$6, updated_at=NOW()
      WHERE user_id=$1 AND hubstaff_user_id=$2 AND connection_version=$3 AND is_active=TRUE`,
    [employee.user_id, employee.hubstaff_user_id, employee.connection_version,
      encryptEmployeeToken(rotated.accessToken, employee, secret),
      encryptEmployeeToken(rotated.refreshToken, employee, secret), rotated.expiresAt]);
    if (!saved.rowCount) throw new EmployeeError('connection_changed', 'Your access changed. Reload and try again.', 409);
    await client.query('COMMIT');
    return rotated.accessToken;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof EmployeeError) throw error;
    throw new EmployeeError('connection_unavailable', 'Your Hubstaff connection could not be refreshed. Please try again.');
  } finally { client.release(); }
}

export async function finishEmployeeSync(db, employee) {
  const result = await db.query(`UPDATE portal_employees SET last_synced_at=NOW()
    WHERE user_id=$1 AND hubstaff_user_id=$2 AND connection_version=$3 AND is_active=TRUE
    RETURNING last_synced_at`, [employee.user_id, employee.hubstaff_user_id, employee.connection_version]);
  if (!result.rowCount) throw new EmployeeError('connection_changed', 'Your access changed. Reload and try again.', 409);
  return new Date(result.rows[0].last_synced_at).toISOString();
}
