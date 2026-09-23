import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";

const MINIMUM_SECRET_LENGTH = 32;

function deriveKey(secret) {
  if (typeof secret !== "string" || secret.length < MINIMUM_SECRET_LENGTH) {
    throw new TypeError("The encryption secret must contain at least 32 characters.");
  }
  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptHubstaffToken(value, secret) {
  if (typeof value !== "string" || !value) throw new TypeError("A token is required.");

  const key = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);

  return [
    "v1",
    iv.toString("base64url"),
    cipher.getAuthTag().toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(".");
}

export function decryptHubstaffToken(value, secret) {
  const key = deriveKey(secret);
  const [version, ivValue, tagValue, ciphertextValue] = String(value || "").split(".");
  if (version !== "v1" || !ivValue || !tagValue || !ciphertextValue) {
    throw new TypeError("The encrypted token is invalid.");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(ivValue, "base64url"),
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
