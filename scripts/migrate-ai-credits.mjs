import {readFile} from "node:fs/promises";
import pg from "pg";
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:8000});
try {
  if(!process.env.DATABASE_URL) throw new Error("Database not configured");
  await db.connect();await db.query("BEGIN");
  await db.query("SET LOCAL lock_timeout='3s'");
  await db.query(await readFile(new URL("../database/ai-credits-schema.sql",import.meta.url),"utf8"));
  await db.query(process.argv.includes("--dry-run")?"ROLLBACK":"COMMIT");
  console.log("AI Credits reporting schema verified. No pricing, allowance, payment or prepaid charge was created.");
} catch(error) {
  await db.query("ROLLBACK").catch(()=>{});
  console.error("AI Credits migration failed",{code:error?.code || "migration_failed"});
  process.exitCode=1;
} finally {await db.end().catch(()=>{});}
