import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Uses the existing dedicated authenticated profile. Never creates login cookies.
const context = await chromium.launchPersistentContext(".debugger-profile", { channel: "chrome", headless: true, viewport: { width: 1500, height: 1000 } });
const report = { checks: [] }, origin = "http://127.0.0.1:3000";
const pass = (name) => { report.checks.push(name); console.log(`PASS ${name}`); };
try {
  const normal = context.pages()[0] || await context.newPage();
  await normal.goto(origin, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await normal.waitForFunction(() => Boolean(window.__AOC_DEBUGGER__), null, { timeout: 90_000 });
  await normal.evaluate(() => Promise.all(Array.from({ length: 6 }, (_, i) => fetch(`/debugger-lab/data.json?probe=${i}`).then(r => r.json()))));
  const identity = await normal.evaluate(() => window.__AOC_DEBUGGER__.tabId);
  const dashboard = await context.newPage();
  await dashboard.goto(`${origin}/?debugger=true`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await dashboard.getByLabel("Monitored tab", { exact: true }).selectOption(identity);
  await dashboard.getByLabel("Resource category", { exact: true }).selectOption("api");
  await dashboard.getByLabel("Search resources", { exact: true }).fill("/debugger-lab/data.json");
  assert.equal(await dashboard.getByLabel("Group nodes", { exact: true }).inputValue(), "endpoint");
  const host = dashboard.locator("[data-graph-nodes]");
  await dashboard.waitForFunction(() => document.querySelector("[data-graph-nodes]")?.dataset.graphNodes === "1", null, { timeout: 30_000 });
  await dashboard.getByRole("button", { name: "Fit graph", exact: true }).click();
  const canvas = dashboard.locator("canvas");
  await canvas.scrollIntoViewIfNeeded();
  let bounds = await canvas.boundingBox();
  await dashboard.mouse.click(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await dashboard.getByRole("heading", { name: "Same endpoint · 6 captured requests", exact: true }).waitFor();
  assert.equal(await dashboard.getByRole("region", { name: "Endpoint request history", exact: true }).getByRole("button").count(), 6);
  pass("six parameter variants become one endpoint node with all six requests inspectable");
  await canvas.evaluate(node => { node.addEventListener("wheel", event => { window.__testWheelPrevented = event.defaultPrevented; }, { once: true }); });
  const pageY = await dashboard.evaluate(() => scrollY);
  await dashboard.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await dashboard.mouse.wheel(0, 700);
  await dashboard.waitForTimeout(250);
  assert.equal(await dashboard.evaluate(() => scrollY), pageY);
  assert.equal(await dashboard.evaluate(() => window.__testWheelPrevented), true);
  pass("wheel zoom cancels native scrolling without moving the HTML page");
  await dashboard.getByRole("button", { name: "Maximize graph workspace", exact: true }).click();
  await dashboard.getByRole("button", { name: "Restore graph size", exact: true }).waitFor();
  const workspace = dashboard.getByLabel("Graph and resource inspector workspace", { exact: true });
  const workBox = await workspace.boundingBox(), inspector = dashboard.locator("aside");
  bounds = await canvas.boundingBox();
  const sideBox = await inspector.boundingBox();
  assert.ok(workBox.y < 20 && workBox.height > 950);
  assert.ok(sideBox.x >= bounds.x + bounds.width - 1 && sideBox.x + sideBox.width <= 1500);
  assert.equal(await dashboard.evaluate(() => document.body.style.overflow), "hidden");
  await mkdir("test-results", { recursive: true });
  await dashboard.screenshot({ path: "test-results/debugger-maximized.png" });
  pass("maximized graph keeps the inspector on the right and locks page scrolling");
  await dashboard.keyboard.press("Escape");
  await dashboard.getByRole("button", { name: "Maximize graph workspace", exact: true }).waitFor();
  assert.notEqual(await dashboard.evaluate(() => document.body.style.overflow), "hidden");
  pass("Escape restores graph size and the page's previous scroll behavior");
  await dashboard.getByLabel("Group nodes", { exact: true }).selectOption("none");
  await dashboard.waitForFunction(() => document.querySelector("[data-graph-nodes]")?.dataset.graphNodes === "6");
  await dashboard.getByLabel("Group nodes", { exact: true }).selectOption("endpoint");
  pass("individual-node mode still exposes all original request records");
  await dashboard.setViewportSize({ width: 390, height: 844 });
  await dashboard.getByRole("button", { name: "Maximize graph workspace", exact: true }).click();
  bounds = await canvas.boundingBox();
  const mobileSide = await inspector.boundingBox();
  assert.ok(bounds.width > 100 && mobileSide.x >= bounds.x + bounds.width - 1 && mobileSide.x + mobileSide.width <= 390);
  assert.ok(await dashboard.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await dashboard.screenshot({ path: "test-results/debugger-maximized-mobile.png" });
  await dashboard.getByRole("button", { name: "Restore graph size", exact: true }).click();
  pass("mobile maximize also retains the right inspector without page overflow");

  await normal.bringToFront();
  const chats = [["General chat", "General mode verified."], ["Work questions", "Work mode verified."]];
  for (const [label, phrase] of process.argv.includes("--graph-only") ? [] : process.argv.includes("--general-only") ? chats.slice(0, 1) : chats) {
    // Unique text prevents a previous saved reply from satisfying this run.
    const reply = `${phrase.slice(0, -1)} ${Date.now()}.`;
    await normal.getByRole("button", { name: label, exact: true }).click();
    const frame = normal.frameLocator('iframe[title$="AI assistant"]');
    const input = frame.getByRole("textbox").first();
    await input.waitFor({ timeout: 90_000 });
    const failures = [];
    const observe = response => { if (response.url().endsWith("/api/chatkit") && response.status() >= 400) failures.push(response.status()); };
    normal.on("response", observe);
    await input.fill(`Reply exactly: ${reply}`);
    await input.press("Enter");
    await frame.getByText(reply, { exact: true }).waitFor({ timeout: 120_000 });
    normal.off("response", observe);
    assert.deepEqual(failures, []);
    pass(`${label} delivers an actual AI reply without HTTP errors`);
  }
  if (!process.argv.includes("--graph-only")) {
    await normal.waitForFunction((expected) => window.__AOC_DEBUGGER__.snapshot().records.filter(record => record.source === "python" && record.status === 200 && ["complete", "closed"].includes(record.state)).length >= expected, process.argv.includes("--general-only") ? 1 : 2, { timeout: 45_000 });
    const spans = await normal.evaluate(() => window.__AOC_DEBUGGER__.snapshot().records);
    const provider = spans.filter(record => record.source === "python" && record.status === 200 && ["complete", "closed"].includes(record.state));
    assert.ok(provider.length >= (process.argv.includes("--general-only") ? 1 : 2), "Expected real Python provider HTTP spans for the verification prompts");
    assert.ok(provider.every(record => spans.some(parent => parent.id === record.parentId && parent.source === "server")));
    pass("actual Python provider requests correlate to recorded server proxy calls");
  }
} catch (error) {
  process.exitCode = 1; report.error = error.message; console.error(error.message);
} finally {
  await mkdir("test-results", { recursive: true });
  const suffix = process.argv.includes("--graph-only") ? "-graph" : process.argv.includes("--general-only") ? "-general" : "";
  await writeFile(`test-results/debugger-interactions${suffix}.json`, JSON.stringify(report, null, 2));
  await context.close();
}
