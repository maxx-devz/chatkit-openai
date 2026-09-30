import test from "node:test";
import assert from "node:assert/strict";
import { sealProviderKey, unsealProviderKey, validateProviderKey, validateProvider } from "../lib/provider-secrets.js";

const secret = "unit-test-only-not-a-real-secret-12345";
const key = "sk-or-v1-unit-test-not-a-real-api-key";
test("credentials encrypt with random nonces and round-trip", () => {
  const value = sealProviderKey("openrouter", key, secret);
  assert.notEqual(value, sealProviderKey("openrouter", key, secret));
  assert.equal(value.includes(key), false);
  assert.equal(unsealProviderKey("openrouter", value, secret), key);
});
test("wrong encryption key, provider and tampered ciphertext fail closed", () => {
  const value = sealProviderKey("openrouter", key, secret);
  assert.throws(() => unsealProviderKey("openai", value, secret));
  assert.throws(() => unsealProviderKey("openrouter", value, secret + "x"));
  const parts = value.split(".");
  parts[3] = (parts[3][0] === "A" ? "B" : "A") + parts[3].slice(1);
  assert.throws(() => unsealProviderKey("openrouter", parts.join("."), secret));
  assert.throws(() => sealProviderKey("openrouter", key, "short"));
});
test("provider-key mismatch cannot be saved or sent to the other provider", () => {
  assert.equal(validateProviderKey("openrouter", ` ${key} `), key);
  assert.throws(() => validateProviderKey("openai", key));
  assert.throws(() => validateProviderKey("openrouter", "sk-proj-unit-test-only-123456789"));
  assert.throws(() => validateProviderKey("openai", "sk-test\nAuthorization:bad"));
  assert.throws(() => validateProvider("https://untrusted.example"));
});
