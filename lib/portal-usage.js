import "server-only";
import { createHash } from "node:crypto";
import { databasePool } from "@/lib/database";
import { getRuntimeProvider } from "@/lib/provider-settings";
import { recordUsage, readUsage, recordProviderStatus } from "@/lib/usage-repository";

const pool = databasePool;

function credentialHash(provider) {
  return createHash("sha256").update(provider.apiKey || "").digest("hex");
}

export async function recordAdminUsage(startedAt, usage, { code, model, provider } = {}) {
  try { await recordUsage(pool, "admin", startedAt, usage); }
  catch (error) {
    // Operational accounting must not replace a delivered assistant reply with an error.
    console.error("Portal usage recording failed", { code: error?.code || "usage_error" });
  }
  if (code) {
    try { await recordProviderStatus(pool, credentialHash(provider || await getRuntimeProvider()), code, model); }
    catch (error) { console.error("API status recording failed", { code: error?.code || "usage_error" }); }
  }
}

// Caller must establish active staff access before reading organization totals.
export async function loadPortalUsage() {
  const provider = await getRuntimeProvider();
  return {
    ...(await readUsage(pool, credentialHash(provider))),
    provider: provider.id,
    providerLabel: provider.label,
  };
}
