import { readFile } from 'node:fs/promises';
import pg from 'pg';

const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--dry-run')) {
    throw new Error('Usage: npm run internal-sync:migrate -- [--dry-run]');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  await client.connect();
  await client.query('BEGIN');
  await client.query("SET LOCAL lock_timeout = '3s'");
  await client.query(await readFile(new URL('../database/internal-sync-cache-schema.sql', import.meta.url), 'utf8'));
  await client.query(args[0] === '--dry-run' ? 'ROLLBACK' : 'COMMIT');
  console.log(args[0] === '--dry-run'
    ? 'Internal sync migration dry-run passed; changes were rolled back.'
    : 'Internal sync settings and snapshot schema are ready.');
} catch (error) {
  await client.query('ROLLBACK').catch(() => {});
  const message = String(error?.message || 'Unknown database error')
    .replaceAll(process.env.DATABASE_URL || ' ', '[database URL removed]').slice(0, 300);
  console.error(`Internal sync migration failed${error?.code ? ` (${error.code})` : ''}: ${message}`);
  process.exitCode = 1;
} finally { await client.end().catch(() => {}); }
