import { Writable } from 'node:stream';
import { createInterface } from 'node:readline/promises';
import pg from 'pg';
import { createPortalAuth, closeAuthDatabase, isPortalAuthConfigured } from '../lib/auth.js';

async function passwordQuestion(prompt) {
  if (!process.stdin.isTTY) throw new Error('Use an interactive terminal. Passwords are never accepted as command arguments.');
  const output = new Writable({ write(_chunk, _encoding, callback) { callback(); } });
  const reader = createInterface({ input: process.stdin, output, terminal: true });
  process.stdout.write(prompt);
  try { return await reader.question(''); }
  finally { reader.close(); process.stdout.write('\n'); }
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  const [usernameValue, displayName, approvedHubstaffId, ...extra] = process.argv.slice(2);
  const username = String(usernameValue || '').toLowerCase();
  if (extra.length || !/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)
    || !displayName?.trim() || displayName.length > 120 || /[\u0000-\u001f<>]/.test(displayName)
    || !/^[1-9][0-9]*$/.test(approvedHubstaffId || '') || !Number.isSafeInteger(Number(approvedHubstaffId))) {
    console.error('Usage: npm run employee:create -- USERNAME "DISPLAY NAME" APPROVED_HUBSTAFF_USER_ID');
    process.exitCode = 1;
  } else {
    if (!isPortalAuthConfigured()) throw new Error();
    await db.connect();
    const exists = await db.query("SELECT to_regclass('portal_employees') AS relation");
    if (!exists.rows[0]?.relation) throw new Error();
    // Never convert or add privileges to an existing client/admin account.
    const duplicate = await db.query('SELECT id FROM "user" WHERE LOWER(username)=$1', [username]);
    const mapping = await db.query('SELECT user_id FROM portal_employees WHERE hubstaff_user_id=$1', [approvedHubstaffId]);
    if (duplicate.rowCount || mapping.rowCount) {
      console.error('That username or Hubstaff mapping is already registered. Existing accounts were not changed.');
      process.exitCode = 1;
    } else {
      const password = await passwordQuestion('New employee password: ');
      const confirmation = await passwordQuestion('Confirm password: ');
      if (password.length < 12 || password.length > 128 || password !== confirmation) throw new Error();
      const provisioning = createPortalAuth({ allowAccountCreation: true, useNextCookies: false });
      const email = `${username}@portal-employees.invalid`;
      const result = await provisioning.api.signUpEmail({ body: { username, email, name: displayName.trim(), password } });
      if (!result?.user?.id) throw new Error();
      // Better Auth owns account creation; if the mapping fails the new login has no portal access.
      await db.query('BEGIN');
      const user = await db.query('INSERT INTO portal_users(external_id,email,display_name) VALUES($1,$2,$3) RETURNING id',
        [result.user.id, email, displayName.trim()]);
      await db.query('INSERT INTO portal_employees(user_id,hubstaff_user_id) VALUES($1,$2)', [user.rows[0].id, approvedHubstaffId]);
      await db.query('COMMIT');
      console.log('Employee account created with employee-only access. Sign in and connect the approved personal Hubstaff account.');
    }
  }
} catch {
  await db.query('ROLLBACK').catch(() => {});
  console.error('Employee provisioning failed. Check configuration, schema, unique mapping, and matching 12–128 character passwords. A newly created login may need administrator recovery; existing accounts were not changed.');
  process.exitCode = 1;
} finally {
  await db.end().catch(() => {});
  await closeAuthDatabase().catch(() => {});
}
