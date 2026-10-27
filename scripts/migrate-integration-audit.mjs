import { readFile } from 'node:fs/promises';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--dry-run')) {
    throw new Error('Usage: npm run integration-audit:migrate -- [--dry-run]');
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  await db.connect();
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout = '3s'");
  await db.query(await readFile(new URL('../database/integration-audit-schema.sql', import.meta.url), 'utf8'));
  await db.query(args[0] === '--dry-run' ? 'ROLLBACK' : 'COMMIT');
  console.log(args[0] === '--dry-run'
    ? 'Integration audit migration dry-run passed. Changes were rolled back.'
    : 'Integration audit schema is ready.');
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  const message = String(error?.message || 'Unknown database error')
    .replaceAll(process.env.DATABASE_URL || ' ', '[database URL removed]').slice(0, 300);
  console.error(`Integration audit migration failed${error?.code ? ` (${error.code})` : ''}: ${message}`);
  process.exitCode = 1;
} finally { await db.end().catch(() => {}); }
