import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";
import { attachDeepCapture } from "./debugger-deep.mjs";
import { cleanUrl, statusColor } from "../lib/debugger/model.js";

// Uses only the developer's dedicated, already signed-in browser profile.
// No test cookie, authentication bypass, database session creation or API key.
const origin = "http://127.0.0.1:3000", report = { checks: [], limitations: [] };
const context = await chromium.launchPersistentContext(".debugger-profile", { channel: "chrome", headless: true, viewport: { width: 1500, height: 1050 } });
let currentProbe, currentCapture;
const check = (name, details) => { report.checks.push({ name, details }); console.log(`PASS ${name}`, details || ""); };
try {
  const normal = context.pages()[0] || await context.newPage();
  await normal.bringToFront();
  const capture = await attachDeepCapture(normal, { origin });
  const reference = await context.newCDPSession(normal), observed = [];
  await reference.send("Network.enable");
  reference.on("Network.requestWillBeSent", (e) => { if (!e.request.url.includes("/api/debugger/")) observed.push(cleanUrl(e.request.url)); });
  await normal.goto(origin, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await normal.waitForFunction(() => Boolean(window.__AOC_DEBUGGER__), { timeout: 90_000 });
  await normal.waitForFunction(() => window.__AOC_DEBUGGER__.snapshot().records.some((r) => r.category === "document" && r.state === "complete"), { timeout: 90_000 });
  const initial = await normal.evaluate(() => window.__AOC_DEBUGGER__.snapshot());
  assert.equal(initial.mode, "deep");
  check("actual authenticated portal refresh", { records: initial.records.length, categories: [...new Set(initial.records.map((r) => r.category))] });
  const dashboard = await context.newPage();
  await dashboard.goto(`${origin}/?debugger=true`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await dashboard.getByRole("heading", { name: "Neural network debugger", exact: true }).waitFor({ timeout: 90_000 });
  await dashboard.bringToFront();
  await dashboard.waitForFunction(() => document.querySelector('[aria-label="Monitored tab"]')?.options.length > 0, { timeout: 60_000 });
  check("two-tab live discovery");

  const probe = await context.newPage();
  currentProbe = probe; await probe.bringToFront();
  const probeCapture = await attachDeepCapture(probe, { origin });
  currentCapture = probeCapture;
  await probe.goto(`${origin}/debugger-lab`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await probe.waitForFunction(() => Boolean(window.__AOC_DEBUGGER__), { timeout: 90_000 });
  await probe.evaluate(() => document.fonts.ready);
  await probe.waitForFunction(() => window.__AOC_DEBUGGER__.snapshot().records.some((r) => r.url?.endsWith("font.ttf") && r.state === "complete"), { timeout: 90_000 });
  let snapshot = await probe.evaluate(() => window.__AOC_DEBUGGER__.snapshot());
  for (const category of ["document", "css", "script", "image", "font"]) assert.ok(snapshot.records.some((r) => r.category === category), `Missing ${category}`);
  check("real document / CSS import / script / image / font capture");

  await probe.getByRole("button", { name: "Parallel requests", exact: true }).click();
  await probe.getByRole("status").filter({ hasText: "Six real HTTP requests completed" }).waitFor({ timeout: 90_000 });
  await probe.waitForFunction(() => window.__AOC_DEBUGGER__.snapshot().records.filter((r) => r.url?.includes("/data.json") && r.state === "complete").length >= 6, { timeout: 60_000 });
  snapshot = await probe.evaluate(() => window.__AOC_DEBUGGER__.snapshot());
  const parallel = snapshot.records.filter((r) => r.url?.includes("/data.json"));
  assert.equal(parallel.length, 6); assert.ok(Math.max(...parallel.map((r) => r.start)) < Math.min(...parallel.map((r) => r.end)));
  check("six concurrent requests stay distinct");
  await probe.getByRole("button", { name: "Delayed response", exact: true }).click();
  await probe.waitForFunction(() => window.__AOC_DEBUGGER__.snapshot().records.some((r) => r.url?.includes("slow.json") && r.state === "complete"), { timeout: 90_000 });
  snapshot = await probe.evaluate(() => window.__AOC_DEBUGGER__.snapshot());
  assert.ok(snapshot.records.find((r) => r.url?.includes("slow.json")).duration >= 1750);
  check("delayed request measured from real network events");
  await probe.getByRole("button", { name: "Streaming response", exact: true }).click();
  await probe.waitForFunction(() => window.__AOC_DEBUGGER__.snapshot().records.some((r) => r.url?.includes("stream.json") && r.state === "receiving"), { timeout: 60_000 });
  await probe.waitForFunction(() => window.__AOC_DEBUGGER__.snapshot().records.some((r) => r.url?.includes("stream.json") && r.state === "complete"), { timeout: 60_000 });
  check("stream headers and completion are distinct");
  await probe.evaluate(async () => { const controller = new AbortController(); const response = await fetch("/debugger-lab/stream.json", { signal: controller.signal }); await response.body.getReader().read(); controller.abort(); });
  await probe.waitForFunction(() => window.__AOC_DEBUGGER__.snapshot().records.some((r) => r.url?.includes("stream.json") && r.state === "cancelled"), null, { timeout: 60_000 });
  check("aborted stream is cancelled, not completed");
  await probe.evaluate(() => fetch("/debugger-lab/redirect.json").then((r) => r.text()));
  await probe.waitForFunction(() => { const records = window.__AOC_DEBUGGER__.snapshot().records; const redirect = records.find((r) => r.url?.includes("redirect.json") && r.status === 307); return redirect && records.some((r) => r.parentId === redirect.id && r.relationship === "redirect" && r.status === 200); }, null, { timeout: 60_000 });
  check("real 307 redirect hop and its exact relationship");
  const beforeChunk = Date.now();
  await probe.getByRole("button", { name: "Dynamic JavaScript chunk", exact: true }).click();
  await probe.getByRole("status").filter({ hasText: "JavaScript chunk has executed" }).waitFor({ timeout: 90_000 });
  await probe.waitForFunction((since) => window.__AOC_DEBUGGER__.snapshot().records.some((r) => r.category === "script" && r.start >= since), beforeChunk, { timeout: 60_000 });
  check("dynamic JavaScript request appears independently");
  await probe.getByRole("button", { name: "Missing image (404)", exact: true }).click();
  await probe.waitForFunction(() => window.__AOC_DEBUGGER__.snapshot().records.some((r) => r.url?.includes("missing.png") && r.status === 404 && r.state === "complete"), { timeout: 60_000 });
  snapshot = await probe.evaluate(() => window.__AOC_DEBUGGER__.snapshot());
  assert.equal(statusColor(snapshot.records.find((r) => r.url?.includes("missing.png"))), "#facc64");
  check("missing image preserves actual HTTP 404 and yellow status");
  await probe.getByRole("button", { name: "500 lazy images", exact: true }).click();
  for (let y = 0; y <= 15_000; y += 650) { await probe.evaluate((top) => window.scrollTo(0, top), y); await probe.waitForTimeout(100); }
  await probe.waitForFunction(() => { const images = window.__AOC_DEBUGGER__.snapshot().records.filter((r) => r.category === "image"); return images.length >= 500 && images.every((r) => ["complete", "failed", "cancelled"].includes(r.state)); }, null, { timeout: 120_000 });
  snapshot = await probe.evaluate(() => window.__AOC_DEBUGGER__.snapshot());
  check("large graph and lazy loading", { imageRequests: snapshot.records.filter((r) => r.category === "image").length });
  await probe.getByRole("button", { name: "Runtime error", exact: true }).click();
  await probe.waitForFunction(() => window.__AOC_DEBUGGER__.snapshot().records.some((r) => r.category === "error" && r.error?.includes("deliberate runtime exception")), null, { timeout: 60_000 });
  check("real runtime exception is traceable");
  const identity = await probe.evaluate(() => ({ tabId: window.__AOC_DEBUGGER__.tabId, navigationId: window.__AOC_DEBUGGER__.navigationId }));
  await dashboard.bringToFront();
  await dashboard.getByLabel("Monitored tab", { exact: true }).selectOption(identity.tabId);
  await dashboard.getByRole("button", { name: "Fit graph", exact: true }).click();
  await dashboard.getByLabel("Group nodes", { exact: true }).selectOption("none");
  const canvas = dashboard.locator("canvas"); const bounds = await canvas.boundingBox();
  await dashboard.mouse.move(bounds.x + 70, bounds.y + 150); await dashboard.mouse.down(); await dashboard.mouse.move(bounds.x + 140, bounds.y + 220, { steps: 8 }); await dashboard.mouse.up();
  await dashboard.getByRole("button", { name: "Zoom out", exact: true }).click();
  await dashboard.getByLabel("Group nodes", { exact: true }).selectOption("type");
  await dashboard.getByRole("button", { name: "Network waterfall", exact: true }).click();
  await dashboard.getByLabel("Navigation", { exact: true }).selectOption("all");
  await dashboard.getByLabel("Resource category", { exact: true }).selectOption("font");
  await dashboard.getByRole("button").filter({ hasText: "font.ttf" }).first().click();
  await dashboard.getByRole("heading", { name: "Resource inspector", exact: true }).waitFor();
  await dashboard.getByRole("button", { name: "Timing", exact: true }).click();
  await dashboard.getByLabel("Resource category", { exact: true }).selectOption("all");
  await dashboard.getByRole("button", { name: "Neural graph", exact: true }).click();
  await dashboard.getByLabel("Errors only", { exact: true }).check();
  await dashboard.getByLabel("Errors only", { exact: true }).uncheck();
  await dashboard.getByRole("button", { name: "Fit graph", exact: true }).click();
  await dashboard.waitForFunction(() => {
    const canvas = document.querySelector("canvas"), context = canvas?.getContext("2d"); if (!context) return false;
    const { data, width, height } = context.getImageData(0, 0, canvas.width, canvas.height);
    let minX = width, maxX = 0, minY = height, maxY = 0;
    for (let y = 0; y < height; y += 3) for (let x = 0; x < width; x += 3) { const i = (y * width + x) * 4; if (data[i + 3] > 180 && data[i] + data[i + 1] + data[i + 2] > 350) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); } }
    return maxX - minX > width * .2 && maxY - minY > height * .2;
  }, null, { timeout: 15_000 });
  check("large canvas pan, zoom, grouping, filters, waterfall and shared inspector");
  await mkdir("test-results", { recursive: true });
  await dashboard.screenshot({ path: "test-results/debugger-live.png", fullPage: true });
  await dashboard.setViewportSize({ width: 390, height: 844 });
  assert.ok(await dashboard.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await dashboard.screenshot({ path: "test-results/debugger-mobile.png", fullPage: true });
  check("responsive layout has no horizontal overflow at 390px");
  const finalNormal = await normal.evaluate(() => window.__AOC_DEBUGGER__.snapshot());
  const captured = new Set(finalNormal.records.filter((r) => r.url).map((r) => r.url));
  const referenceUrls = new Set(observed.filter((url) => !url.includes("/api/debugger/") && !url.includes("debugger=true")));
  report.comparison = { referenceUniqueUrls: referenceUrls.size, capturedUniqueUrls: captured.size, notYetCapturedOrOutsidePageSession: [...referenceUrls].filter((url) => !captured.has(url)) };
  report.metrics = snapshot.metrics;
  await normal.bringToFront();
  const chatTest = normal.getByRole("button", { name: /^Reply only: Debugger live test/i }).first();
  if (await chatTest.count()) {
    await chatTest.click();
    const chatFrame = normal.frames().find((frame) => frame.url().includes("cdn.platform.openai.com/deployments/chatkit/"));
    if (chatFrame) {
      const response = chatFrame.getByText("Debugger live test complete.", { exact: true });
      const delivered = await response.waitFor({ timeout: 30_000 }).then(() => true).catch(() => false);
      report.chatkit = delivered ? "Previously sent real test prompt has its expected saved AI reply." : "The previous test thread opened, but its expected AI reply was unavailable.";
      if (delivered) check("real ChatKit test reply remains readable");
    }
  }
  report.limitations.push("Main-page CDP session does not guarantee worker / OOPIF target coverage.", "Provider live test and production-disabled checks are recorded separately.");
  await capture.dispose(); await probeCapture.dispose(); await reference.detach();
} catch (error) {
  report.error = error.message; process.exitCode = 1; console.error(error.message);
  if (currentProbe) {
    const snapshot = await currentProbe.evaluate(() => window.__AOC_DEBUGGER__?.snapshot()).catch(() => null);
    if (snapshot) {
      const images = snapshot.records.filter((r) => r.category === "image");
      report.failureDiagnostics = { capture: currentCapture?.stats(), imageCount: images.length, states: images.reduce((acc, r) => { acc[r.state] = (acc[r.state] || 0) + 1; return acc; }, {}), pending: images.filter((r) => ["pending", "receiving"].includes(r.state)).slice(0, 10).map(({ url, state, revision, status }) => ({ url, state, revision, status })) };
      console.error(JSON.stringify(report.failureDiagnostics));
    }
  }
}
finally { await mkdir("test-results", { recursive: true }); await writeFile("test-results/debugger-live.json", JSON.stringify(report, null, 2)); await context.close(); }
