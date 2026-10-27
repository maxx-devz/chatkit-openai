import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { loadEnvFile } from "node:process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { cleanText } from "../lib/debugger/model.js";

// Reuses a real signed-in profile. A second isolated browser receives the SAME
// real cookies in memory, an even stronger test than two separate logins. No
// credentials/cookies are printed, persisted, fabricated, or revoked by tests.
loadEnvFile(".env.local");
const origin = "http://127.0.0.1:3105", report = { checks: [] };
let server, a, b, isolated, serverDiagnostics = "";
const pass = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
async function start(enabled) {
  try { await fetch(`${origin}/api/debugger/events`, { signal: AbortSignal.timeout(500) }); throw new Error("Port 3105 is occupied; refusing to test another server."); }
  catch (error) { if (error.message.startsWith("Port 3105")) throw error; }
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3105"], {
    env: { ...process.env, NODE_ENV: "production", BETTER_AUTH_URL: origin, DEBUGGER: String(enabled), DEBUGGER_DEVELOPERS: "", DEBUGGER_CAPTURE_BODIES: "true" },
    stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  });
  serverDiagnostics = "";
  const recordOutput = chunk => { serverDiagnostics = (serverDiagnostics + chunk.toString()).slice(-16_000); };
  server.stdout.on("data", recordOutput); server.stderr.on("data", recordOutput);
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error("Production test server exited.");
    try { await fetch(`${origin}/api/debugger/events`, { signal: AbortSignal.timeout(1000) }); return; }
    catch { await new Promise(resolve => setTimeout(resolve, 200)); }
  }
  throw new Error("Production test server did not become ready.");
}
async function stop() {
  if (!server) return;
  const child = server; server = null;
  const exited = new Promise(resolve => child.once("exit", resolve));
  child.kill();
  await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 5000))]);
}
try {
  await start(true);
  a = await chromium.launchPersistentContext(".debugger-profile", { channel: "chrome", headless: true, viewport: { width: 1500, height: 950 } });
  const portalA = a.pages()[0] || await a.newPage();
  await portalA.goto(origin, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await portalA.waitForFunction(() => Boolean(window.__AOC_DEBUGGER__), null, { timeout: 90_000 });
  assert.equal(await portalA.evaluate(() => window.__AOC_DEBUGGER__.config.captureBodies), false);
  const tabA = await portalA.evaluate(() => window.__AOC_DEBUGGER__.tabId);
  const dashA = await a.newPage();
  await dashA.goto(`${origin}/?debugger=true`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await dashA.getByRole("heading", { name: "Neural network debugger", exact: true }).waitFor();
  await dashA.waitForFunction(id => [...document.querySelector('[aria-label="Monitored tab"]').options].some(option => option.value === id), tabA);
  pass("production DEBUGGER=true authorizes the existing non-admin login and discovers its own portal tab");

  const debuggerPaths = ["/internal", "/internal/internal-settings", "/internal/internal-settings/integrations", "/internal/team", "/internal/settings", "/admin", "/builder"];
  for (const path of debuggerPaths) {
    const response = await dashA.goto(`${origin}${path}?debugger=true`, { waitUntil: "domcontentloaded", timeout: 90_000 });
    assert.equal(response.status(), 200, path);
    await dashA.getByRole("heading", { name: "Neural network debugger", exact: true }).waitFor();
    assert.equal(new URL(dashA.url()).pathname, path);
    assert.equal(await dashA.getByRole("link", { name: "Open portal ↗", exact: true }).getAttribute("href"), path);
    assert.match(response.headers()["cache-control"], /private.*no-store/);
  }
  pass("every tested nested internal, admin and builder URL opens the same authorized inspector and returns to its own page");

  await dashA.goto(`${origin}/internal/team?sort=name&debugger=true`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  assert.equal(await dashA.getByRole("link", { name: "Open portal ↗", exact: true }).getAttribute("href"), "/internal/team?sort=name");
  const prefetched = await a.request.get(`${origin}/internal/internal-settings?debugger=true`, {
    headers: { "next-router-prefetch": "1", purpose: "prefetch", "x-aoc-debugger-portal-path": "//untrusted.example" },
  });
  assert.equal(prefetched.status(), 200);
  const prefetchBody = await prefetched.text();
  assert.ok(prefetchBody.includes("Neural network debugger"));
  assert.ok(!prefetchBody.includes("untrusted.example"));
  const sessionCheck = await a.request.get(`${origin}/api/debugger/session?debugger=true`);
  assert.equal(sessionCheck.status(), 200);
  assert.match(sessionCheck.headers()["content-type"], /application\/json/);
  pass("filters survive return links, prefetches use the inspector, forged return headers are ignored and APIs remain JSON");

  b = await chromium.launch({ channel: "chrome", headless: true });
  isolated = await b.newContext();
  await isolated.addCookies(await a.cookies(origin));
  const dashB = await isolated.newPage();
  await dashB.goto(`${origin}/?debugger=true`, { waitUntil: "domcontentloaded", timeout: 90_000 });
  await dashB.getByRole("heading", { name: "Neural network debugger", exact: true }).waitFor();
  await dashB.waitForTimeout(500);
  assert.equal(await dashB.getByLabel("Monitored tab", { exact: true }).locator(`option[value="${tabA}"]`).count(), 0);
  pass("another browser with even identical login cookies cannot discover the first browser's tab/history");

  const portalB = await isolated.newPage();
  await portalB.goto(origin, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await portalB.waitForFunction(() => Boolean(window.__AOC_DEBUGGER__), null, { timeout: 90_000 });
  const tabB = await portalB.evaluate(() => window.__AOC_DEBUGGER__.tabId);
  assert.notEqual(tabB, tabA);
  await dashB.waitForFunction(id => [...document.querySelector('[aria-label="Monitored tab"]').options].some(option => option.value === id), tabB);
  assert.equal(await dashA.getByLabel("Monitored tab", { exact: true }).locator(`option[value="${tabB}"]`).count(), 0);
  assert.equal(await dashB.getByLabel("Monitored tab", { exact: true }).locator(`option[value="${tabA}"]`).count(), 0);
  pass("both browsers independently capture their own tabs without cross-browser discovery");

  const readOwnTrace = page => page.evaluate(async () => {
    const response = await fetch(`/api/hubstaff?debuggerIsolation=${Date.now()}`);
    await response.arrayBuffer();
    return { status: response.status, inline: response.headers.has("x-aoc-debug-records") };
  });
  const reads = await Promise.all([readOwnTrace(portalA), readOwnTrace(portalB)]);
  assert.ok(reads.every(result => result.status === 200 && result.inline));
  const snapshots = await Promise.all([portalA, portalB].map(page => page.evaluate(() => window.__AOC_DEBUGGER__.snapshot().records)));
  for (let i = 0; i < 2; i++) {
    const own = snapshots[i], other = new Set(snapshots[1 - i].map(record => record.id));
    const spans = own.filter(record => record.source === "server");
    assert.ok(spans.length > 0);
    assert.ok(spans.every(record => !other.has(record.id)));
    assert.ok(own.every(record => record.tabId === (i === 0 ? tabA : tabB)));
  }
  pass("concurrent real read-only Hubstaff requests return request-local server spans to their own browser only");
  for (const path of ["/api/debugger/events", "/api/debugger/backend"]) {
    const result = await a.request.fetch(origin + path, { method: path.endsWith("backend") ? "POST" : "GET" });
    assert.equal(result.status(), 404);
  }
  assert.equal((await a.request.post(origin + "/api/debugger/events", { data: { records: [] } })).status(), 404);
  for (const path of ["/debugger-lab", "/debugger-lab/image.svg", "/debugger-lab/data.json", "/debugger-lab/workflow"]) assert.equal((await a.request.get(origin + path)).status(), 404);
  pass("no account-wide trace feed or collector exists; all production test fixtures remain unavailable");
  const anonymous = await b.newContext();
  for (const path of ["/", ...debuggerPaths]) assert.equal((await anonymous.request.get(`${origin}${path}?debugger=true`)).status(), 404, path);
  assert.equal((await anonymous.request.get(`${origin}/api/debugger/session`)).status(), 404);
  await anonymous.close();
  pass("anonymous visitors cannot activate the production debugger");

  // Exercise the capture teardown notification without actually signing out or
  // revoking the shared real auth session used by the two test contexts.
  await portalA.evaluate(() => window.__AOC_DEBUGGER__.stop("access-ended"));
  await dashA.getByText("Session ended or authorization expired — reload to continue", { exact: true }).waitFor();
  assert.equal(await dashA.getByLabel("Monitored tab", { exact: true }).locator(`option[value="${tabA}"]`).count(), 0);
  assert.equal(await portalA.evaluate(() => typeof window.__AOC_DEBUGGER__), "undefined");
  assert.equal(await portalB.evaluate(() => typeof window.__AOC_DEBUGGER__), "object");
  pass("ending one browser's capture clears only its own debugger and leaves the other browser active");

  await stop(); await start(false);
  for (const path of ["/", ...debuggerPaths]) assert.equal((await a.request.get(`${origin}${path}?debugger=true`)).status(), 404, path);
  await portalA.reload({ waitUntil: "domcontentloaded" });
  await portalA.waitForTimeout(1000);
  assert.equal(await portalA.evaluate(() => typeof window.__AOC_DEBUGGER__), "undefined");
  pass("DEBUGGER=false disables production dashboard and normal-page instrumentation even for a valid login");
} catch (error) { process.exitCode = 1; report.error = error.message; console.error(error.message); console.error(cleanText(serverDiagnostics, 12_000)); }
finally {
  await isolated?.close(); await b?.close(); await a?.close(); await stop();
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/debugger-isolation.json", JSON.stringify(report, null, 2));
}
