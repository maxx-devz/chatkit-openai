import "server-only";
import { databasePool } from "./database.js";
import { resolveAiProvider } from "./ai-provider.js";
import { unsealProviderKey, sealProviderKey, validateProvider, validateProviderKey } from "./provider-secrets.js";

const pool = databasePool;

export function providerFromKey(id, apiKey, model) {
  validateProvider(id);
  const provider = resolveAiProvider({ ...process.env, OPENAI_API_KEY: id === "openai" ? apiKey : "",
    OPENROUTER_API_KEY: id === "openrouter" ? apiKey : "", OPENAI_MODEL: id === "openai" ? model || "" : "",
    OPENROUTER_MODEL: id === "openrouter" ? model || "" : "" });
  return { ...provider, baseURL: id === "openai" ? "https://api.openai.com/v1" : "https://openrouter.ai/api/v1" };
}

export async function providerState() {
  try {
    const { rows } = await pool.query(`SELECT c.provider,c.encrypted_key,c.key_suffix,s.model,
      (a.provider=c.provider) AS active FROM portal_ai_credentials c
      LEFT JOIN portal_site_ai_settings s ON s.provider=c.provider
      LEFT JOIN portal_ai_active_provider a ON a.id=1`);
    return { rows, ready: true };
  } catch (error) {
    if (error.code !== "42P01") throw error;
    return { rows: [], ready: false };
  }
}

export async function getRuntimeProvider(id) {
  const { rows } = await providerState();
  const row = id ? rows.find((row) => row.provider === id) : rows.find((row) => row.active);
  if (row) return providerFromKey(row.provider,
    unsealProviderKey(row.provider, row.encrypted_key, process.env.PROVIDER_SETTINGS_SECRET), row.model);
  if (!id) return resolveAiProvider(); // migration compatibility only
  validateProvider(id);
  const key = id === "openrouter" ? process.env.OPENROUTER_API_KEY ||
    (process.env.OPENAI_API_KEY?.startsWith("sk-or-v1-") ? process.env.OPENAI_API_KEY : "")
    : process.env.OPENAI_API_KEY?.startsWith("sk-or-v1-") ? "" : process.env.OPENAI_API_KEY || "";
  return providerFromKey(id, key, id === "openrouter" ? process.env.OPENROUTER_MODEL : process.env.OPENAI_MODEL);
}

export async function publicProviderSettings() {
  const { rows, ready } = await providerState();
  const encryptionReady = (process.env.PROVIDER_SETTINGS_SECRET?.length || 0) >= 32;
  return { ready: ready && encryptionReady,
    setupMessage: !ready ? "Run npm run site-ai:migrate to enable these settings."
      : !encryptionReady ? "Set the same stable PROVIDER_SETTINGS_SECRET (32+ characters) on both servers and restart them." : "",
    activeProvider: rows.find((row) => row.active)?.provider || resolveAiProvider().id,
    providers: ["openai", "openrouter"].map((id) => {
      const row = rows.find((row) => row.provider === id);
      return { id, configured: Boolean(row), keySuffix: row?.key_suffix || "", model: row?.model || "" };
    }), database: { configured: Boolean(process.env.DATABASE_URL), connected: true,
      managedBy: "deployment", note: "The database URL is a startup setting shared by the portal and Python backend. Change it in deployment settings; changing it does not migrate client data." } };
}

export async function saveProviderConfiguration(id, key, model, adminId) {
  validateProvider(id);
  if (key) validateProviderKey(id, key);
  const db = await pool.connect();
  try {
    await db.query("BEGIN");
    if (key) {
      await db.query(`INSERT INTO portal_ai_credentials(provider,encrypted_key,key_suffix,updated_by)
        VALUES($1,$2,$3,$4) ON CONFLICT(provider) DO UPDATE SET encrypted_key=$2,key_suffix=$3,
        updated_by=$4,updated_at=NOW()`, [id, sealProviderKey(id, key, process.env.PROVIDER_SETTINGS_SECRET), key.slice(-4), adminId]);
    } else if (!(await db.query("SELECT provider FROM portal_ai_credentials WHERE provider=$1 FOR UPDATE", [id])).rows.length) {
      throw new Error("Enter an API key before saving this provider.");
    }
    await db.query(`INSERT INTO portal_site_ai_settings(provider,model,updated_by) VALUES($1,$2,$3)
      ON CONFLICT(provider) DO UPDATE SET model=$2,updated_by=$3,updated_at=NOW()`, [id, model, adminId]);
    await db.query(`INSERT INTO portal_ai_active_provider(id,provider,updated_by) VALUES(1,$1,$2)
      ON CONFLICT(id) DO UPDATE SET provider=$1,updated_by=$2,updated_at=NOW()`, [id, adminId]);
    await db.query("COMMIT");
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  } finally { db.release(); }
}
