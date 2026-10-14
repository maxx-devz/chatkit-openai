import { readFile } from 'node:fs/promises';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--dry-run')) {
    throw new Error('Usage: npm run internal-user:migrate -- [--dry-run]');
  }
  const dryRun = args[0] === '--dry-run';
  if (!process.env.DATABASE_URL) throw new Error();
  await db.connect();
  await db.query('BEGIN');
  await db.query("SET LOCAL lock_timeout = '3s'");
  await db.query(await readFile(new URL('../database/internal-user-schema.sql', import.meta.url), 'utf8'));
  await db.query(dryRun ? 'ROLLBACK' : 'COMMIT');
  console.log(dryRun
    ? 'Internal user migration dry-run passed. All changes were rolled back.'
    : 'Internal user schema is ready. Existing account IDs, sessions, mappings, and encrypted tokens were preserved.');
} catch (error) {
  await db.query('ROLLBACK').catch(() => {});
  const message = String(error?.message || 'Unknown database error')
    .replaceAll(process.env.DATABASE_URL || ' ', '[database URL removed]')
    .slice(0, 300);
  console.error(`Internal user migration failed${error?.code ? ` (${error.code})` : ''}: ${message}`);
  process.exitCode = 1;
} finally { await db.end().catch(() => {}); }
