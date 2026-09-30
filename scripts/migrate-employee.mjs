import { readFile } from 'node:fs/promises';
import pg from 'pg';

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  if (!process.env.DATABASE_URL) throw new Error();
  await db.connect();
  await db.query('BEGIN');
  await db.query(await readFile(new URL('../database/employee-schema.sql', import.meta.url), 'utf8'));
  await db.query('COMMIT');
  console.log('Employee schema is ready. Existing portal records were not modified.');
} catch {
  await db.query('ROLLBACK').catch(() => {});
  console.error('Employee migration failed. Check database access and run the existing portal migrations first.');
  process.exitCode = 1;
} finally { await db.end().catch(() => {}); }
