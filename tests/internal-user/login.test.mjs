import { test, mock, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { getMigrations } from 'better-auth/db/migration';

// Exercise the actual shared Better Auth configuration against an ephemeral DB.
const sqlite = new DatabaseSync(':memory:');
mock.module('pg', { defaultExport: { Pool: class { constructor() { return sqlite; } } } });
process.env.DATABASE_URL = 'postgresql://fixture.invalid/unused';
process.env.BETTER_AUTH_URL = 'http://127.0.0.1:3000';
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString('hex');
const { auth, createPortalAuth } = await import('../../lib/auth.js');
const provision = createPortalAuth({ allowAccountCreation: true, useNextCookies: false });
const login = createPortalAuth({ useNextCookies: false });
after(() => sqlite.close());

test('actual Better Auth username/password login and sessions work for client, admin and internal user accounts', async () => {
  await (await getMigrations(auth.options)).runMigrations();
  for (const role of ['client', 'admin', 'internal-user']) {
    const password = randomBytes(24).toString('base64url');
    const username = `fixture-${role}`;
    const created = await provision.api.signUpEmail({ body: {
      username, email: `${username}@example.invalid`, name: `Fixture ${role}`, password,
    } });
    const response = await login.api.signInUsername({ body: { username, password }, asResponse: true });
    assert.equal(response.status, 200);
    const cookie = response.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
    const session = await login.api.getSession({ headers: new Headers({ cookie }) });
    assert.equal(session.user.id, created.user.id);
    assert.equal(session.user.username, username);
    assert.equal(JSON.stringify(session).includes(password), false);
    if (role === 'internal-user') {
      const newPassword = 'FixtureChanged123!';
      const changed = await login.api.changePassword({ body: {
        currentPassword: password, newPassword, revokeOtherSessions: true,
      }, headers: new Headers({ cookie }), asResponse: true });
      assert.equal(changed.status, 200);
      const rotatedCookie = changed.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
      assert.ok(rotatedCookie);
      assert.equal(await login.api.getSession({ headers: new Headers({ cookie }) }), null);
      assert.equal((await login.api.getSession({ headers: new Headers({ cookie: rotatedCookie }) })).user.id,
        created.user.id);
      assert.notEqual((await login.api.signInUsername({ body: { username, password }, asResponse: true })).status, 200);
      assert.equal((await login.api.signInUsername({ body: { username, password: newPassword }, asResponse: true })).status, 200);
    }
  }
});
