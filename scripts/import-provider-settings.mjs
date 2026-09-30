// One-time local migration. Never logs credentials or database URLs.
// Keep .env.local intact until the encrypted database round-trip is verified.
import { readFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import pg from "pg";
import { resolveAiProvider, isOpenRouterKey } from "../lib/ai-provider.js";
import { sealProviderKey, unsealProviderKey, validateProviderKey } from "../lib/provider-secrets.js";

const original = await readFile(new URL("../.env.local", import.meta.url), "utf8");
const env = parseEnv(original);
const secret = env.PROVIDER_SETTINGS_SECRET;
if (!secret || secret.length < 32) throw new Error("Set a stable PROVIDER_SETTINGS_SECRET before importing.");
const router = env.OPENROUTER_API_KEY?.trim() || (isOpenRouterKey(env.OPENAI_API_KEY) ? env.OPENAI_API_KEY.trim() : "");
if (env.OPENROUTER_API_KEY && isOpenRouterKey(env.OPENAI_API_KEY) && router !== env.OPENAI_API_KEY.trim()) {
  throw new Error("Two different OpenRouter keys are present. Choose which to keep before importing.");
}
const keys = { openai: isOpenRouterKey(env.OPENAI_API_KEY) ? "" : env.OPENAI_API_KEY?.trim(), openrouter: router };
const patchOnly = process.argv.includes("--env-patch");
const db = new pg.Client({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 8000, query_timeout: 15000 });
try {
  await db.connect();
  if (!patchOnly) await db.query(await readFile(new URL("../chatkit_backend/site_ai_schema.sql", import.meta.url), "utf8"));
  await db.query("BEGIN");
  for (const [provider, key] of Object.entries(keys)) {
    if (!key) continue;
    validateProviderKey(provider, key);
    const existing = (await db.query("SELECT encrypted_key FROM portal_ai_credentials WHERE provider=$1", [provider])).rows[0];
    if (existing) {
      if (unsealProviderKey(provider, existing.encrypted_key, secret) !== key) throw new Error("A different saved key exists. Local keys have not been removed.");
    } else if (patchOnly) throw new Error("Import keys first. Local keys have not been removed.");
    else {
      await db.query("INSERT INTO portal_ai_credentials(provider,encrypted_key,key_suffix,updated_by) VALUES($1,$2,$3,'local-import')",
        [provider, sealProviderKey(provider, key, secret), key.slice(-4)]);
    }
    if (!patchOnly) {
      const model = resolveAiProvider({ ...env, OPENAI_API_KEY: provider === "openai" ? key : "",
        OPENROUTER_API_KEY: provider === "openrouter" ? key : "" }).model;
      await db.query("INSERT INTO portal_site_ai_settings(provider,model,updated_by) VALUES($1,$2,'local-import') ON CONFLICT(provider) DO NOTHING", [provider, model]);
    }
    const stored = (await db.query("SELECT encrypted_key FROM portal_ai_credentials WHERE provider=$1", [provider])).rows[0];
    if (unsealProviderKey(provider, stored.encrypted_key, secret) !== key) throw new Error("Encrypted key verification failed.");
  }
  if (!patchOnly && Object.values(keys).some(Boolean)) await db.query(
    "INSERT INTO portal_ai_active_provider(id,provider,updated_by) VALUES(1,$1,'local-import') ON CONFLICT(id) DO NOTHING", [resolveAiProvider(env).id]);
  const saved = (await db.query("SELECT provider,encrypted_key FROM portal_ai_credentials")).rows;
  for (const row of saved) unsealProviderKey(row.provider, row.encrypted_key, secret);
  await db.query("COMMIT");
  if (patchOnly) {
    const lines = original.replaceAll("\r\n", "\n").trimEnd().split("\n");
    const updated = lines.filter((line) => !/^\s*(?:export\s+)?(?:OPENAI_API_KEY|OPENROUTER_API_KEY|OPENAI_MODEL|OPENROUTER_MODEL)\s*=/.test(line));
    console.log("*** Begin Patch\n*** Update File: .env.local\n@@\n" + lines.map((line) => "-" + line).join("\n")
      + "\n" + updated.map((line) => "+" + line).join("\n") + "\n*** End Patch");
  } else console.log("Provider credentials encrypted and verified. Existing saved models and active provider preserved. Local environment is unchanged.");
} catch {
  await db.query("ROLLBACK").catch(() => {});
  console.error("Provider import failed. Check database connectivity, encryption secret, and key conflicts. Local credentials were not removed.");
  process.exitCode = 1;
} finally { await db.end(); }
