import assert from "node:assert/strict";
import { chromium } from "@playwright/test";

// Focused stream regression, separate from canvas hit-testing. Uses a real
// existing login and one short actual reply per selected chat mode.
const context = await chromium.launchPersistentContext(".debugger-profile", { channel: "chrome", headless: true });
try {
  const page = context.pages()[0] || await context.newPage();
  await page.goto("http://127.0.0.1:3000", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.bringToFront();
  await page.waitForFunction(() => Boolean(window.__AOC_DEBUGGER__), null, { timeout: 90_000 });
  const modes = process.argv.includes("--general-only") ? ["General chat"] : ["General chat", "Work questions"];
  for (const mode of modes) {
    await page.getByRole("button", { name: mode, exact: true }).click();
    const frame = page.frameLocator('iframe[title$="AI assistant"]');
    const input = frame.getByRole("textbox").first();
    await input.waitFor({ timeout: 90_000 });
    const reply = `Stream verified ${Date.now()}.`;
    await input.fill(`Reply exactly: ${reply}`); await input.press("Enter");
    await frame.getByText(reply, { exact: true }).waitFor({ timeout: 120_000 });
    console.log(`PASS ${mode}: actual ChatKit reply rendered`);
  }
  await page.waitForFunction(expected => window.__AOC_DEBUGGER__?.snapshot().records.filter(record => record.source === "python" && record.status === 200 && ["complete", "closed"].includes(record.state)).length >= expected, modes.length, { timeout: 45_000 });
  const records = await page.evaluate(() => window.__AOC_DEBUGGER__.snapshot().records);
  const providers = records.filter(record => record.source === "python" && record.status === 200 && ["complete", "closed"].includes(record.state));
  assert.ok(providers.length >= modes.length);
  assert.ok(providers.every(record => records.some(parent => parent.id === record.parentId && parent.source === "server")));
  assert.ok(!records.some(record => record.url?.includes("/api/debugger/events") || record.url?.includes("/api/debugger/backend")));
  console.log("PASS provider HTTP lifecycles return inline to the originating browser with real server-parent correlation, without a shared trace feed");
} finally { await context.close(); }
