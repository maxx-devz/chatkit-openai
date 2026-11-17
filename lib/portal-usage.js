import "server-only";
import { createHash } from "node:crypto";
import { databasePool } from "@/lib/database";
import { getRuntimeProvider, providerState } from "@/lib/provider-settings";
import { unsealProviderKey } from "@/lib/provider-secrets";
import { resolveAiProvider } from "@/lib/ai-provider";
import { recordUsage, readUsage, recordProviderStatus } from "@/lib/usage-repository";
import { recordAiUsageEvent } from '@/lib/portal-audit';

const pool = databasePool;

function credentialHash(provider) {
  return createHash("sha256").update(provider.apiKey || "").digest("hex");
}

export async function recordAdminUsage(startedAt, usage, { code, model, provider,
  actorUserId, clientId = null, requestId } = {}) {
  await recordAiUsageEvent(pool, { requestId, clientId, actorUserId, action: 'admin_ai.reply',
    provider: provider?.id || null, model, status: code === 'ready' ? 'succeeded' : 'failed',
    usage, startedAt });
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
  // Keep allowance/history reads independent of credential decryption. Database
  // errors still propagate; only the credential-specific API status degrades.
  const { rows } = await providerState();
  const saved = rows.find(row => row.active);
  const provider = saved ? { id: saved.provider, label: saved.provider === "openrouter" ? "OpenRouter" : "OpenAI" } : resolveAiProvider();
  let hash = null;
  let providerCredentialReady = true;
  if (saved) {
    try { hash = credentialHash({ apiKey: unsealProviderKey(saved.provider, saved.encrypted_key, process.env.PROVIDER_SETTINGS_SECRET) }); }
    catch { providerCredentialReady = false; }
  } else hash = credentialHash(provider);
  return {
    ...(await readUsage(pool, hash)),
    provider: provider.id,
    providerLabel: provider.label,
    providerCredentialReady,
    ...(!providerCredentialReady ? { providerCredentialMessage: "Stored usage is available, but the saved provider key cannot be read with this server's encryption configuration. Restore the original PROVIDER_SETTINGS_SECRET, or have an administrator re-save the key after aligning both servers. No provider request was made." } : {}),
  };
}
