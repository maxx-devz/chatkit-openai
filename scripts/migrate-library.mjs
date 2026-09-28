import { readFile } from "node:fs/promises";
import pg from "pg";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("Set DATABASE_URL in .env.local before running the client library migration.");
  process.exit(1);
}
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 1, connectionTimeoutMillis: 8000 });
try {
  const schema = await readFile(new URL("../chatkit_backend/library_schema.sql", import.meta.url), "utf8");
  await pool.query(schema);
  console.log("The private client document library is ready. Existing chats and uploads were preserved.");
} catch (error) {
  console.error("Client library migration failed", { code: error?.code || "connection_error" });
  process.exitCode = 1;
} finally { await pool.end(); }
