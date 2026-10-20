import { readFile } from 'node:fs/promises';
import pg from 'pg';

const args = process.argv.slice(2);
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  if (args.length > 1 || (args.length === 1 && args[0] !== '--dry-run')) {
    throw new Error('Usage: npm run internal-hubstaff-oauth:migrate -- [--dry-run]');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  await db.connect();
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout = '3s'");
  await db.query(await readFile(new URL('../database/internal-hubstaff-oauth-schema.sql', import.meta.url), 'utf8'));
  await db.query(args[0] === '--dry-run' ? 'ROLLBACK' : 'COMMIT');
  console.log(args[0] === '--dry-run'
    ? 'Internal Hubstaff OAuth migration dry-run passed; changes were rolled back.'
    : 'Internal Hubstaff connection method is ready. Existing PAT connections were preserved.');
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  const safe = String(error?.message || 'Unknown database error')
    .replaceAll(process.env.DATABASE_URL || ' ', '[database URL removed]').slice(0, 300);
  console.error(`Internal Hubstaff OAuth migration failed${error?.code ? ` (${error.code})` : ''}: ${safe}`);
  process.exitCode = 1;
} finally { await db.end().catch(() => {}); }
