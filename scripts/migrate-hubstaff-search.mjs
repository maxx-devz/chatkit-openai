import { readFile } from "node:fs/promises";
import pg from "pg";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  if (!process.env.DATABASE_URL) throw new Error("Database not configured");
  await db.connect();
  await db.query(await readFile(new URL("../database/hubstaff-search-schema.sql", import.meta.url), "utf8"));
  console.log("Project-scoped Hubstaff search tables and indexes are ready. No Hubstaff data was changed.");
} catch (error) {
  console.error("Hubstaff search migration failed", { code: error?.code || "migration_failed" });
  process.exitCode = 1;
} finally { await db.end(); }
