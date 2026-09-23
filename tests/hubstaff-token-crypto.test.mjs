import assert from "node:assert/strict";
import test from "node:test";
import {
  decryptHubstaffToken,
  encryptHubstaffToken,
} from "../lib/hubstaff-token-crypto.js";

const SECRET = "correct horse battery staple plus more entropy";

test("Hubstaff tokens round-trip through authenticated encryption", () => {
  const encrypted = encryptHubstaffToken("private-refresh-token", SECRET);
  assert.match(encrypted, /^v1\.[^.]+\.[^.]+\.[^.]+$/);
  assert.equal(decryptHubstaffToken(encrypted, SECRET), "private-refresh-token");
});

test("Hubstaff token encryption uses a fresh IV", () => {
  assert.notEqual(
    encryptHubstaffToken("same-token", SECRET),
    encryptHubstaffToken("same-token", SECRET),
  );
});

test("Hubstaff token decryption rejects the wrong secret", () => {
  const encrypted = encryptHubstaffToken("private-refresh-token", SECRET);
  assert.throws(
    () => decryptHubstaffToken(encrypted, "a different secret with enough characters"),
  );
});

test("Hubstaff token encryption rejects short secrets", () => {
  assert.throws(() => encryptHubstaffToken("private-refresh-token", "too-short"));
});
