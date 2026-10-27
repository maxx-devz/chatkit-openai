import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

const origin = "http://127.0.0.1:3105";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", "3105"], { env: { ...process.env, NODE_ENV: "production", DEBUGGER: "false" }, stdio: "ignore", windowsHide: true });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("Isolated production check server did not start.");
    try { await fetch(`${origin}/?debugger=true`, { signal: AbortSignal.timeout(1000) }); ready = true; break; } catch { await new Promise((resolve) => setTimeout(resolve, 200)); }
  }
  assert.ok(ready, "Isolated production check did not become ready.");
  const statuses = {};
  for (const path of ["/?debugger=true", "/api/debugger/events", "/debugger-lab", "/debugger-lab/image.svg", "/debugger-lab/workflow"]) {
    statuses[path] = (await fetch(origin + path)).status;
    assert.equal(statuses[path], 404, path);
  }
  browser = await chromium.launch({ channel: "chrome", headless: true });
  const page = await browser.newPage();
  const denied = await page.goto("http://127.0.0.1:3000/?debugger=true", { waitUntil: "domcontentloaded", timeout: 90_000 });
  assert.equal(denied.status(), 404);
  assert.equal(await page.evaluate(() => typeof window.__AOC_DEBUGGER__), "undefined");
  console.log("PASS unauthenticated development browser cannot activate or inspect capture");
  await page.goto(`${origin}/?debugger=true`, { waitUntil: "domcontentloaded" });
  assert.equal(await page.evaluate(() => typeof window.__AOC_DEBUGGER__), "undefined");
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/debugger-disabled.json", JSON.stringify({ NODE_ENV: "production", DEBUGGER: "false", statuses, runtime: "not installed" }, null, 2));
  console.log("PASS DEBUGGER=false blocks the production dashboard and instrumentation");
} finally {
  await browser?.close();
  server.kill();
}
