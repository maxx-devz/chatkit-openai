import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL?.trim()) throw new Error("Set DATABASE_URL in .env.local first.");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  await db.connect();
  await db.query(await readFile(new URL("../database/prepared-source-schema.sql", import.meta.url), "utf8"));
  console.log("Prepared-source cache and audience publication tables are ready. No sources were published.");
} catch (error) {
  console.error("Prepared-source migration failed", { code: error?.code || "connection_error" });
  process.exitCode = 1;
} finally { await db.end(); }
