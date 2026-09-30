import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

export function validateProvider(id) {
  if (!["openai", "openrouter"].includes(id)) throw new Error("Choose OpenAI or OpenRouter.");
  return id;
}

export function validateProviderKey(id, key) {
  validateProvider(id);
  if (typeof key !== "string" || !/^sk-[A-Za-z0-9_-]{16,500}$/.test(key.trim())
      || (id === "openrouter") !== key.trim().startsWith("sk-or-v1-")) {
    throw new Error(`Enter a valid ${id === "openai" ? "OpenAI" : "OpenRouter"} API key.`);
  }
  return key.trim();
}

function encryptionKey(secret) {
  if (!secret || secret.length < 32) throw new Error("Provider encryption is not configured.");
  return createHash("sha256").update(secret).digest();
}

export function sealProviderKey(id, key, secret) {
  validateProvider(id);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(secret), iv);
  cipher.setAAD(Buffer.from(`aoc-provider:${id}:v1`));
  const data = Buffer.concat([cipher.update(key, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), data.toString("base64url")].join(".");
}

export function unsealProviderKey(id, value, secret) {
  validateProvider(id);
  const [version, iv, tag, data, extra] = String(value || "").split(".");
  if (version !== "v1" || !iv || !tag || !data || extra) throw new Error("Invalid encrypted provider key.");
  const cipher = createDecipheriv("aes-256-gcm", encryptionKey(secret), Buffer.from(iv, "base64url"));
  cipher.setAAD(Buffer.from(`aoc-provider:${id}:v1`));
  cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(data, "base64url")), cipher.final()]).toString("utf8");
}
