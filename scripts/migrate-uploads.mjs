import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("Set DATABASE_URL in .env.local before running the upload migration.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 8000 });
try {
  const schema = await readFile(new URL("../chatkit_backend/upload_schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
  console.log("Private attachment tables are ready. Existing chats and files were preserved.");
} catch (error) {
  console.error("Upload migration failed", { code: error?.code || "connection_error" });
  process.exitCode = 1;
} finally { await pool.end(); }
