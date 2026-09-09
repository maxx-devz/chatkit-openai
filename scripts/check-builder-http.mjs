import assert from "node:assert/strict";
const origin = "http://127.0.0.1:3000";
const cases = [
  ["/", {}, 307],
  ["/login", {}, 200],
  ["/admin", {}, 307],
  ["/api/chatkit", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" }, 401],
  ["/api/chatkit", { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" }, 403],
  ["/api/workspace", {}, 401],
  ["/api/workspace", { method: "PUT" }, 405],
  ["/api/chat", { method: "POST" }, 404],
  ["/api/models", {}, 404],
  ["/builder", {}, 307],
  ["/api/builder", {}, 401],
  ["/api/builder", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" }, 401],
  ["/api/builder", { method: "POST", headers: { Origin: "https://untrusted.example", "Content-Type": "application/json" }, body: "{}" }, 403],
  ["/api/builder/preview", { method: "POST", headers: { Origin: origin, "Content-Type": "application/json" }, body: "{}" }, 401],
  ["/api/assistant-files/00000000-0000-4000-8000-000000000000", {}, 401],
  ["/api/assistant-files/00000000-0000-4000-8000-000000000000?preview=1", {}, 401],
];
for (const [path, init, status] of cases) {
  const response = await fetch(origin + path, { ...init, redirect: "manual" });
  assert.equal(response.status, status, path);
  if (path.startsWith("/api/builder") || path.startsWith("/api/assistant-files") || path === "/api/chatkit") {
    assert.equal(response.headers.get("cache-control"), "private, no-store");
  }
  await response.body?.cancel();
}
for (const path of ["/chatkit", "/builder-preview"]) {
  const response = await fetch("http://127.0.0.1:8000" + path, { method: "POST", body: "{}", headers: { "Content-Type": "application/json" } });
  assert.equal(response.status, 401, path);
  await response.body?.cancel();
}
console.log("HTTP passed: staff login redirect, protected editor/preview/downloads, origin validation, private caching, signed Python endpoints.");
