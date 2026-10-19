import { readFile } from "node:fs/promises";
import pg from "pg";

const args = process.argv.slice(2);
const connectionString = process.env.DATABASE_URL;
const client = new pg.Client({ connectionString, connectionTimeoutMillis: 8000 });

try {
  if (args.length > 1 || (args.length === 1 && args[0] !== "--dry-run")) {
    throw new Error("Usage: npm run client-access:migrate -- [--dry-run]");
  }
  if (!connectionString) throw new Error("DATABASE_URL is required.");
  await client.connect();
  await client.query("BEGIN");
  await client.query("SET LOCAL lock_timeout = '3s'");
  const migration = await readFile(new URL("../database/client-access-schema.sql", import.meta.url), "utf8");
  await client.query(migration);
  await client.query(args[0] === "--dry-run" ? "ROLLBACK" : "COMMIT");
  console.log(args[0] === "--dry-run"
    ? "Client access migration dry-run passed; all changes were rolled back."
    : "Client roles and access audit schema are ready.");
} catch (error) {
  await client.query("ROLLBACK").catch(() => {});
  const safe = String(error?.message || "Unknown database error")
    .replaceAll(connectionString || " ", "[database URL removed]").slice(0, 300);
  console.error(`Client access migration failed${error?.code ? ` (${error.code})` : ""}: ${safe}`);
  process.exitCode = 1;
} finally {
  await client.end().catch(() => {});
}
