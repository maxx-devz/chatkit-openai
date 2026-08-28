import { readFile } from "node:fs/promises";

import pg from "pg";

const { Pool } = pg;

if (!process.env.DATABASE_URL?.trim()) {
  console.error("Admin migration failed: DATABASE_URL must be set in .env.local.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 8_000,
});

try {
  const schemaUrl = new URL("../database/admin-schema.sql", import.meta.url);
  const schema = await readFile(schemaUrl, "utf8");
  await pool.query(schema);
  console.log("AOC administrator and AI-control schema is up to date.");
} catch (error) {
  console.error(`Admin migration failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  await pool.end().catch(() => null);
}
