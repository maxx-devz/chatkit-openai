import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import { chatKitBackendUrl, signChatKitRequest } from "../lib/chatkit-security.js";

const secret = "test-only-shared-secret-with-at-least-32-characters";
test("signatures bind the exact body, including tenant identity and Unicode", () => {
  const body = JSON.stringify({ client_id: "1", text: "你好" });
  const headers = signChatKitRequest(body, secret, 1234);
  assert.equal(headers["x-chatkit-timestamp"], "1234");
  assert.equal(headers["x-chatkit-signature"], createHmac("sha256", secret).update(`1234.${body}`).digest("hex"));
  assert.notEqual(signChatKitRequest(body.replace('"1"', '"2"'), secret, 1234)["x-chatkit-signature"], headers["x-chatkit-signature"]);
  assert.notEqual(signChatKitRequest(body, secret, 1235)["x-chatkit-signature"], headers["x-chatkit-signature"]);
  assert.throws(() => signChatKitRequest(body, "short", 1234));
});
test("production proxy accepts HTTPS origins and rejects unsafe or ambiguous URLs", () => {
  assert.equal(chatKitBackendUrl("https://backend.example", true).href, "https://backend.example/chatkit");
  assert.equal(chatKitBackendUrl("http://127.0.0.1:8000", false).href, "http://127.0.0.1:8000/chatkit");
  for (const value of ["http://example.com", "http://127.0.0.1:8000", "https://user:password@example.com", "https://example.com/chatkit", "https://example.com?token=secret", "https://example.com#part", "file:///tmp/backend"]) {
    assert.throws(() => chatKitBackendUrl(value, true), value);
  }
});
