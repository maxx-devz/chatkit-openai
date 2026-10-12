import { readFile } from 'node:fs/promises';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  if (!process.env.DATABASE_URL) throw new Error();
  await db.connect();
  await db.query('BEGIN');
  await db.query(await readFile(new URL('../database/internal-user-schema.sql', import.meta.url), 'utf8'));
  await db.query('COMMIT');
  console.log('Internal user schema is ready. Existing account IDs, sessions, mappings, and encrypted tokens were preserved.');
} catch {
  await db.query('ROLLBACK').catch(() => {});
  console.error('Internal user migration failed. Check database access, duplicate legacy tables, and the existing portal migrations.');
  process.exitCode = 1;
} finally { await db.end().catch(() => {}); }
