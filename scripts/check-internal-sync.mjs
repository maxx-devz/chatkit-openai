import pg from 'pg';

const tables = [
  'portal_internal_sync_settings',
  'portal_internal_sync_settings_audit',
  'portal_internal_sync_snapshots',
];

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  await client.connect();
  for (const name of tables) {
    const { rows } = await client.query('SELECT to_regclass($1) AS relation', [name]);
    if (!rows[0]?.relation) throw new Error(`${name} is missing.`);
    console.log(`${name}: present`);
  }
} catch (error) {
  const detail = tables.some(name => error?.message === `${name} is missing.`)
    ? error.message : 'Check database access and the migration target.';
  console.error(`Internal sync check failed${error?.code ? ` (${error.code})` : ''}: ${detail}`);
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
