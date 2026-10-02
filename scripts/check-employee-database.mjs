// Real PostgreSQL semantics using TEMP fixtures only; all work is rolled back.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { findEmployee, claimEmployeeRequest, saveEmployeeConnection, finishEmployeeSync,
  encryptEmployeeToken, decryptEmployeeToken } from '../lib/employee-repository.js';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, query_timeout: 10000 });
try {
  await db.connect();
  await db.query('BEGIN');
  await db.query(`CREATE TEMP TABLE portal_users(id BIGINT PRIMARY KEY,external_id TEXT UNIQUE,display_name TEXT);
    CREATE TEMP TABLE portal_clients(id BIGINT PRIMARY KEY,display_name TEXT);
    CREATE TEMP TABLE portal_memberships(user_id BIGINT,client_id BIGINT,role TEXT);
    CREATE TEMP TABLE portal_admins(user_id BIGINT PRIMARY KEY,role TEXT,is_active BOOLEAN);
    INSERT INTO portal_users VALUES(1,'employee-a','A'),(2,'employee-b','B'),(3,'client','Client'),(4,'admin','Admin');
    INSERT INTO portal_clients VALUES(1,'Preserved client');
    INSERT INTO portal_memberships VALUES(3,1,'client_admin');
    INSERT INTO portal_admins VALUES(4,'aoc_admin',TRUE);`);
  const before = await db.query(`SELECT row_to_json(c) AS record FROM portal_clients c
    UNION ALL SELECT row_to_json(m) FROM portal_memberships m UNION ALL SELECT row_to_json(a) FROM portal_admins a`);
  const schema = (await readFile(new URL('../database/employee-schema.sql', import.meta.url), 'utf8'))
    .replaceAll('CREATE TABLE IF NOT EXISTS', 'CREATE TEMP TABLE IF NOT EXISTS');
  await db.query(schema);
  await db.query(schema);
  for (const name of ['portal_users', 'portal_employees', 'portal_clients', 'portal_memberships', 'portal_admins']) {
    assert.equal((await db.query('SELECT relnamespace=pg_my_temp_schema() AS temporary FROM pg_class WHERE oid=$1::regclass', [name])).rows[0].temporary, true);
  }
  await db.query('INSERT INTO portal_employees(user_id,hubstaff_user_id) VALUES(1,101),(2,202)');
  const a = await findEmployee(db, 'employee-a');
  const b = await findEmployee(db, 'employee-b');
  assert.equal(a.position, 'team_member');
  assert.deepEqual(a.panel_access, ['overview', 'my_tasks', 'activity', 'hubstaff']);
  await db.query(`UPDATE portal_employees SET position='project_manager',
    panel_access='["overview","my_tasks","activity","team_directory","team_tasks","hubstaff"]'::jsonb
    WHERE user_id=2`);
  assert.equal((await findEmployee(db, 'employee-b')).position, 'project_manager');
  assert.equal(await findEmployee(db, 'client'), null);
  assert.equal(await findEmployee(db, 'admin'), null);
  const secret = 'test-only-database-encryption-secret-longer-than-32';
  const token = 'fixture-personal-access-token-never-real';
  const cipher = encryptEmployeeToken(token, a, secret);
  await claimEmployeeRequest(db, a);
  await assert.rejects(claimEmployeeRequest(db, a), e => e.publicDetails.status === 429);
  await saveEmployeeConnection(db, a, cipher);
  const connected = await findEmployee(db, 'employee-a');
  await assert.rejects(claimEmployeeRequest(db, connected, { connecting: true }), e => e.publicDetails.status === 429);
  assert.equal(decryptEmployeeToken(connected, secret), token);
  assert.equal((await findEmployee(db, 'employee-b')).encrypted_access_token, null);
  await assert.rejects(saveEmployeeConnection(db, a, cipher), e => e.publicDetails.status === 409);
  assert.match(await finishEmployeeSync(db, connected), /^\d{4}-/);
  await db.query('UPDATE portal_employees SET is_active=FALSE WHERE user_id=1');
  await assert.rejects(finishEmployeeSync(db, connected), e => e.publicDetails.status === 409);
  assert.throws(() => decryptEmployeeToken({ ...b, encrypted_access_token: cipher }, secret));
  await db.query('SAVEPOINT duplicate_mapping');
  await assert.rejects(db.query('INSERT INTO portal_employees(user_id,hubstaff_user_id) VALUES(3,202)'), e => e.code === '23505');
  await db.query('ROLLBACK TO SAVEPOINT duplicate_mapping');
  const after = await db.query(`SELECT row_to_json(c) AS record FROM portal_clients c
    UNION ALL SELECT row_to_json(m) FROM portal_memberships m UNION ALL SELECT row_to_json(a) FROM portal_admins a`);
  assert.deepEqual(after.rows, before.rows);
  console.log('Employee SQL passed: additive/idempotent schema, unchanged legacy fixtures, identity lookup, unique mapping, encrypted isolation, rate limit, stale writes and revocation. All changes rolled back.');
} catch {
  console.error('Employee database checks failed. No diagnostic credentials or database values were printed.');
  process.exitCode = 1;
} finally { await db.query('ROLLBACK').catch(() => {}); await db.end().catch(() => {}); }
