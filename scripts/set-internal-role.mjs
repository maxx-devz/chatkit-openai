import { databasePool } from '../lib/postgres.js';
import { INTERNAL_ASSIGNABLE_ROLE_IDS } from '../lib/internal-permissions.js';

const [action, usernameValue, role, ...extra] = process.argv.slice(2);
const username = String(usernameValue || '').toLowerCase();
const valid = ['grant', 'revoke'].includes(action)
  && /^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)
  && [...INTERNAL_ASSIGNABLE_ROLE_IDS, 'internal_admin'].includes(role)
  && extra.length === 0;

if (!valid) {
  console.error(`Usage: npm run internal-user:role -- grant|revoke USERNAME ${[...INTERNAL_ASSIGNABLE_ROLE_IDS, 'internal_admin'].join('|')}`);
  process.exitCode = 1;
} else {
  let client;
  try {
    if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured.');
    client = await databasePool.connect();
    await client.query('BEGIN');
    await client.query('LOCK TABLE portal_internal_user_roles IN SHARE ROW EXCLUSIVE MODE');
    const { rows } = await client.query(`SELECT e.user_id, e.is_active
      FROM portal_internal_users e JOIN portal_users p ON p.id=e.user_id
      JOIN "user" u ON u.id=p.external_id WHERE LOWER(u.username)=$1 FOR UPDATE OF e`, [username]);
    if (rows.length !== 1) throw new Error('No matching internal user account.');
    const userId = rows[0].user_id;
    if (action === 'grant' && !rows[0].is_active) throw new Error('Activate the internal user before granting a role.');
    if (action === 'revoke' && role === 'internal_access_manager' && rows[0].is_active) {
      const managers = await client.query(`SELECT COUNT(*)::int AS count FROM portal_internal_user_roles r
        JOIN portal_internal_users e ON e.user_id=r.user_id
        WHERE r.role_key='internal_access_manager' AND e.is_active=TRUE`);
      if (Number(managers.rows[0].count) <= 1) throw new Error('Cannot revoke the last active Internal Access Manager.');
    }
    const changed = action === 'grant'
      ? await client.query(`INSERT INTO portal_internal_user_roles(user_id,role_key) VALUES($1,$2)
        ON CONFLICT DO NOTHING RETURNING user_id`, [userId, role])
      : await client.query(`DELETE FROM portal_internal_user_roles WHERE user_id=$1 AND role_key=$2 RETURNING user_id`, [userId, role]);
    if (changed.rowCount) {
      await client.query(`INSERT INTO portal_internal_access_audit(target_user_id,action)
        VALUES($1,$2)`, [userId, `role.${action}.${role}`]);
    }
    await client.query('COMMIT');
    console.log(changed.rowCount
      ? `Role ${action} completed for ${username}.`
      : 'Role assignment already matched the requested state.');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    console.error(error.message || 'Role assignment failed. Run the internal user migration and check the account.');
    process.exitCode = 1;
  } finally {
    client?.release();
    await databasePool.end().catch(() => {});
  }
}
