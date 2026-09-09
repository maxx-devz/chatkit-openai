import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL?.trim()) throw new Error("Set DATABASE_URL in .env.local first.");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  await db.connect();
  await db.query(await readFile(new URL("../chatkit_backend/usage_schema.sql", import.meta.url), "utf8"));
  console.log("Portal usage tracking is ready. Existing allowances and histories are unchanged.");
} catch (error) {
  console.error("Usage migration failed", { code: error?.code || "connection_error" });
  process.exitCode = 1;
} finally { await db.end(); }
