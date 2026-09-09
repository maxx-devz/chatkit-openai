import "server-only";
import pg from "pg";
import { createHash } from "node:crypto";
import { recordUsage, readUsage, recordProviderStatus } from "@/lib/usage-repository";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2,
  connectionTimeoutMillis: 8000, idleTimeoutMillis: 20000, statement_timeout: 10000 });

function credentialHash() {
  return createHash("sha256").update(process.env.OPENAI_API_KEY || "").digest("hex");
}

export async function recordAdminUsage(startedAt, usage, { code, model } = {}) {
  try { await recordUsage(pool, "admin", startedAt, usage); }
  catch (error) {
    // Operational accounting must not replace a delivered assistant reply with an error.
    console.error("Portal usage recording failed", { code: error?.code || "usage_error" });
  }
  if (code) {
    try { await recordProviderStatus(pool, credentialHash(), code, model); }
    catch (error) { console.error("API status recording failed", { code: error?.code || "usage_error" }); }
  }
}

// Caller must establish active staff access before reading organization totals.
export function loadPortalUsage() { return readUsage(pool, credentialHash()); }
