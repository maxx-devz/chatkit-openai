import test from "node:test";
import assert from "node:assert/strict";
import { debuggerPageRequest, debuggerPortalPath } from "../lib/debugger/routing.js";
import nextConfig from "../next.config.mjs";

const origin = "https://portal.example";

test("all portal pages share one inspector without losing their source page", () => {
  for (const path of ["/", "/internal", "/internal/team", "/internal/settings", "/internal/internal-settings", "/internal/audit", "/internal/roles/developer", "/employee", "/admin", "/admin/clients/123", "/login"]) {
    assert.deepEqual(debuggerPageRequest(`${origin}${path}?debugger=true`), {
      rewrite: path !== "/", destination: `${origin}/?debugger=true`, portalPath: path,
    });
  }
});

test("inspection preserves normal filters but removes its own and RSC parameters", () => {
  const route = debuggerPageRequest(`${origin}/internal/team?project=12&debugger=true&status=active&_rsc=next-cache`);
  assert.equal(route.destination, `${origin}/?debugger=true`);
  assert.equal(route.portalPath, "/internal/team?project=12&status=active");
  assert.equal(debuggerPortalPath("/internal?debugger=true#tasks"), "/internal");
});

test("normal pages and ambiguous or disabled query flags do not change routes", () => {
  for (const query of ["", "?debugger=false", "?debugger=TRUE", "?debugger=1", "?debugger=", "?debugger=true&debugger=false", "?debugger=true&debugger=true"]) {
    assert.equal(debuggerPageRequest(`${origin}/internal${query}`), null, query);
  }
});

test("API, Next.js internals and asset requests retain their original responses", () => {
  for (const path of ["/api/chatkit", "/api/debugger/session", "/api/internal-user/tasks", "/_next/static/chunk.js", "/_next/image", "/.well-known/security.txt", "/logo.png", "/probe.css", "/script.mjs", "/font.woff2", "/debugger-lab/data.json", "/robots.txt", "/sitemap.xml", "/manual.pdf"]) {
    assert.equal(debuggerPageRequest(`${origin}${path}?debugger=true`), null, path);
  }
});

test("debugger queries never rewrite mutations or preflights", () => {
  for (const method of ["POST", "PATCH", "PUT", "DELETE", "OPTIONS"]) {
    assert.equal(debuggerPageRequest(`${origin}/internal?debugger=true`, method), null, method);
  }
  assert.equal(debuggerPageRequest(`${origin}/internal?debugger=true`, "HEAD").rewrite, true);
});

test("return links cannot become external URLs or re-enable the inspector", () => {
  for (const path of [undefined, null, 1, "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "\n/internal", "/internal\r\nInjected:yes", "/internal tasks"]) {
    assert.equal(debuggerPortalPath(path), "/", String(path));
  }
  assert.equal(debuggerPortalPath("/internal?debugger=true&debugger=false&tab=mine"), "/internal?tab=mine");
  assert.equal(debuggerPortalPath("/internal?filter=" + "x".repeat(5000)), "/internal");
  assert.equal(debuggerPortalPath("/" + "x".repeat(5000)), "/");
});

test("invalid URLs cannot activate proxy rewriting", () => {
  for (const value of ["", "/internal?debugger=true", "not a URL"]) assert.equal(debuggerPageRequest(value), null);
});

test("rewrites preserve the original origin without NextURL loopback normalization", () => {
  assert.equal(nextConfig.skipProxyUrlNormalize, true);
  for (const localOrigin of ["http://127.0.0.1:3105", "http://localhost:3105", "http://[::1]:3105", origin]) {
    assert.equal(debuggerPageRequest(`${localOrigin}/internal?debugger=true`).destination, `${localOrigin}/?debugger=true`);
  }
});
