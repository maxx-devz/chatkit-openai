// Real PostgreSQL semantics using TEMP fixtures only; all work is rolled back.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import {
  claimInternalUserRequest,
  decryptInternalUserToken,
  encryptInternalUserToken,
  findInternalUser,
  finishInternalUserSync,
  saveInternalUserConnection,
} from '../lib/internal-user-repository.js';

const db = new pg.Client({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 8000,
  query_timeout: 10000,
});

try {
  await db.connect();
  await db.query('BEGIN');
  await db.query('SET LOCAL search_path = pg_temp, pg_catalog');
  await db.query(`
    CREATE TEMP TABLE portal_users (
      id BIGINT PRIMARY KEY,
      external_id TEXT UNIQUE,
      display_name TEXT
    );
    CREATE TEMP TABLE portal_clients (id BIGINT PRIMARY KEY, display_name TEXT);
    CREATE TEMP TABLE portal_memberships (user_id BIGINT, client_id BIGINT, role TEXT);
    CREATE TEMP TABLE portal_admins (user_id BIGINT PRIMARY KEY, role TEXT, is_active BOOLEAN);
    CREATE TEMP TABLE portal_employees (
      user_id BIGINT PRIMARY KEY REFERENCES portal_users(id) ON DELETE CASCADE,
      role TEXT NOT NULL DEFAULT 'employee' CHECK (role = 'employee'),
      position TEXT NOT NULL DEFAULT 'team_member',
      panel_access JSONB NOT NULL DEFAULT '["overview","my_tasks","activity","hubstaff"]'::jsonb,
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      hubstaff_user_id BIGINT NOT NULL UNIQUE CHECK (hubstaff_user_id > 0),
      encrypted_access_token TEXT,
      encrypted_refresh_token TEXT,
      access_expires_at TIMESTAMPTZ,
      connection_version BIGINT NOT NULL DEFAULT 0,
      last_synced_at TIMESTAMPTZ,
      next_request_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    INSERT INTO portal_users VALUES
      (1, 'internal-user-a', 'A'),
      (2, 'internal-user-b', 'B'),
      (3, 'client', 'Client'),
      (4, 'admin', 'Admin');
    INSERT INTO portal_clients VALUES (1, 'Preserved client');
    INSERT INTO portal_memberships VALUES (3, 1, 'client_admin');
    INSERT INTO portal_admins VALUES (4, 'aoc_admin', TRUE);
  `);

  const secret = 'test-only-database-encryption-secret-longer-than-32';
  const token = 'fixture-personal-access-token-never-real';
  const legacyRow = { user_id: '1', hubstaff_user_id: '101' };
  const legacyCipher = encryptInternalUserToken(token, legacyRow, secret);
  await db.query(
    `INSERT INTO portal_employees (
      user_id, hubstaff_user_id, encrypted_access_token, encrypted_refresh_token
    ) VALUES (1, 101, $1, 'preserved-refresh-ciphertext'), (2, 202, NULL, NULL)`,
    [legacyCipher],
  );

  const before = await db.query(`
    SELECT row_to_json(c) AS record FROM portal_clients c
    UNION ALL SELECT row_to_json(m) FROM portal_memberships m
    UNION ALL SELECT row_to_json(a) FROM portal_admins a
  `);
  const schema = (await readFile(
    new URL('../database/internal-user-schema.sql', import.meta.url),
    'utf8',
  )).replaceAll('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE IF NOT EXISTS');

  await db.query(schema);
  await db.query(schema);

  // A stranded empty legacy relation must not block the active mapping table.
  await db.query('CREATE TEMP TABLE portal_employees (user_id BIGINT)');
  await db.query(schema);
  assert.equal((await db.query("SELECT to_regclass('portal_internal_user_roles') AS relation")).rows[0].relation !== null, true);
  await db.query("INSERT INTO portal_internal_user_roles(user_id, role_key) VALUES (1, 'internal_admin')");
  assert.equal((await db.query("SELECT role_key FROM portal_internal_user_roles WHERE user_id=1 AND role_key='internal_admin'")).rows.length, 1);
  await db.query('SAVEPOINT role_revocation');
  await db.query(`INSERT INTO portal_internal_user_roles(user_id, role_key)
    VALUES (1, 'internal_access_manager'), (2, 'internal_access_manager')`);
  const revocationTarget = await db.query(`SELECT e.is_active FROM portal_internal_users e
    JOIN portal_internal_user_roles r ON r.user_id=e.user_id
    WHERE e.user_id=$1 AND r.role_key='internal_access_manager' FOR UPDATE OF e`, [2]);
  assert.equal(revocationTarget.rows[0].is_active, true);
  const activeManagers = await db.query(`SELECT COUNT(*)::int AS count FROM portal_internal_user_roles r
    JOIN portal_internal_users e ON e.user_id=r.user_id
    WHERE r.role_key='internal_access_manager' AND e.is_active=TRUE`);
  assert.equal(activeManagers.rows[0].count, 2);
  await db.query("DELETE FROM portal_internal_user_roles WHERE user_id=2 AND role_key='internal_access_manager'");
  await db.query(`INSERT INTO portal_internal_access_audit(actor_user_id,target_user_id,action)
    VALUES(1,2,'role.revoke.internal_access_manager')`);
  assert.equal((await db.query("SELECT COUNT(*)::int AS count FROM portal_internal_access_audit WHERE action='role.revoke.internal_access_manager'")).rows[0].count, 1);
  await db.query('ROLLBACK TO SAVEPOINT role_revocation');
  await db.query('SAVEPOINT populated_legacy');
  await db.query('INSERT INTO portal_employees(user_id) VALUES (1)');
  await assert.rejects(db.query(schema), error => /resolve the duplicate tables/.test(error.message));
  await db.query('ROLLBACK TO SAVEPOINT populated_legacy');
  await db.query('DROP TABLE portal_employees');

  assert.equal((await db.query("SELECT to_regclass('portal_employees') AS relation")).rows[0].relation, null);
  for (const name of [
    'portal_users',
    'portal_internal_users',
    'portal_clients',
    'portal_memberships',
    'portal_admins',
  ]) {
    const result = await db.query(
      'SELECT relnamespace = pg_my_temp_schema() AS temporary FROM pg_class WHERE oid = $1::regclass',
      [name],
    );
    assert.equal(result.rows[0].temporary, true);
  }
  const constraints = await db.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'portal_internal_users'::regclass
  `);
  assert.deepEqual(
    constraints.rows
      .map(({ conname }) => conname)
      .filter(name => name.startsWith('portal_employees_')),
    [],
  );

  const a = await findInternalUser(db, 'internal-user-a');
  const b = await findInternalUser(db, 'internal-user-b');
  assert.equal(a.account_type, 'internal_user');
  assert.equal(a.position, 'team_member');
  assert.deepEqual(a.panel_access, ['overview', 'my_tasks', 'activity', 'hubstaff']);
  assert.equal(a.encrypted_refresh_token, 'preserved-refresh-ciphertext');
  assert.equal(decryptInternalUserToken(a, secret), token);
  await db.query(`
    UPDATE portal_internal_users
    SET position = 'project_manager',
      panel_access = '["overview","my_tasks","activity","team_directory","hubstaff"]'::jsonb
    WHERE user_id = 2
  `);
  assert.equal((await findInternalUser(db, 'internal-user-b')).position, 'project_manager');
  assert.equal(await findInternalUser(db, 'client'), null);
  assert.equal(await findInternalUser(db, 'admin'), null);

  await claimInternalUserRequest(db, a);
  await assert.rejects(claimInternalUserRequest(db, a), error => error.publicDetails.status === 429);
  await saveInternalUserConnection(db, a, legacyCipher);
  const connected = await findInternalUser(db, 'internal-user-a');
  await assert.rejects(
    claimInternalUserRequest(db, connected, { connecting: true }),
    error => error.publicDetails.status === 429,
  );
  assert.equal(decryptInternalUserToken(connected, secret), token);
  assert.equal((await findInternalUser(db, 'internal-user-b')).encrypted_access_token, null);
  await assert.rejects(saveInternalUserConnection(db, a, legacyCipher), error => error.publicDetails.status === 409);
  assert.match(await finishInternalUserSync(db, connected), /^\d{4}-/);
  await db.query('UPDATE portal_internal_users SET is_active = FALSE WHERE user_id = 1');
  await assert.rejects(finishInternalUserSync(db, connected), error => error.publicDetails.status === 409);
  assert.throws(() => decryptInternalUserToken({ ...b, encrypted_access_token: legacyCipher }, secret));

  await db.query('SAVEPOINT duplicate_mapping');
  await assert.rejects(
    db.query('INSERT INTO portal_internal_users (user_id, hubstaff_user_id) VALUES (3, 202)'),
    error => error.code === '23505',
  );
  await db.query('ROLLBACK TO SAVEPOINT duplicate_mapping');

  const after = await db.query(`
    SELECT row_to_json(c) AS record FROM portal_clients c
    UNION ALL SELECT row_to_json(m) FROM portal_memberships m
    UNION ALL SELECT row_to_json(a) FROM portal_admins a
  `);
  assert.deepEqual(after.rows, before.rows);
  console.log('Internal user SQL passed: legacy table and role migration, idempotence, preserved mappings/tokens, unchanged client/admin fixtures, unique mapping, encrypted isolation, rate limiting, stale writes, and revocation. All changes rolled back.');
} catch (error) {
  const detail = String(error?.message || error || 'Unknown database error')
    .replace(process.env.DATABASE_URL || '', '[database URL removed]')
    .slice(0, 300);
  const code = typeof error?.code === 'string' ? ` (${error.code})` : '';
  console.error(`Internal user database checks failed${code}: ${detail}. No credentials or row values were printed.`);
  process.exitCode = 1;
} finally {
  await db.query('ROLLBACK').catch(() => {});
  await db.end().catch(() => {});
}
