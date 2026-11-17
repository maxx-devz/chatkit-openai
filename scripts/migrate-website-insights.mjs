import { readFile } from "node:fs/promises";
import pg from "pg";
if (!process.env.DATABASE_URL) throw new Error("Set DATABASE_URL before running website-insights:migrate.");
const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000 });
try {
  await db.connect();
  await db.query(await readFile(new URL("../database/website-insights.sql", import.meta.url), "utf8"));
  console.log("Client Website Insights tables are ready. Existing portal data was preserved.");
} catch (error) {
  console.error("Website Insights migration failed:", error.code || "database_error");
  process.exitCode = 1;
} finally { await db.end(); }
