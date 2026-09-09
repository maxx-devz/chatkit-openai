import { readFile } from "node:fs/promises";
import pg from "pg";
if (!process.env.DATABASE_URL?.trim()) throw new Error("Set DATABASE_URL in .env.local first.");
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 8000 });
try {
  await pool.query(await readFile(new URL("../chatkit_backend/builder_schema.sql", import.meta.url), "utf8"));
  console.log("Assistant builder tables are ready. No client configuration was published.");
} catch (error) {
  console.error("Builder migration failed", { code: error?.code || "connection_error" });
  process.exitCode = 1;
} finally { await pool.end(); }
