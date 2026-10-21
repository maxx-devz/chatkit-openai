import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL?.trim()) throw new Error("Set DATABASE_URL in .env.local first.");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  await db.connect();
  await db.query(await readFile(new URL("../database/drive-source-schema.sql", import.meta.url), "utf8"));
  console.log("Admin-private Drive connection tables are ready. No client or Internal Portal data was changed.");
} catch (error) {
  console.error("Drive source migration failed", { code: error?.code || "connection_error" });
  process.exitCode = 1;
} finally { await db.end(); }
