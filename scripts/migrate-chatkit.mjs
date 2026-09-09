import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("Set DATABASE_URL in .env.local before running the ChatKit migration.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 8000 });
try {
  const schema = await readFile(new URL("../chatkit_backend/schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
  console.log("ChatKit tables are ready. Existing conversations were preserved.");
} catch (error) {
  console.error("ChatKit migration failed", { code: error?.code || "connection_error", message: error?.message });
  process.exitCode = 1;
} finally {
  await pool.end();
}
