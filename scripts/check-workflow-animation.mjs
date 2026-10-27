import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Real component, authorized development fixture; no AI requests or tokens.
const context = await chromium.launchPersistentContext(".debugger-profile", { channel: "chrome", headless: true, viewport: { width: 1100, height: 760 } });
const report = { checks: [] }, check = name => { report.checks.push(name); console.log(`PASS ${name}`); };
try {
  const page = context.pages()[0] || await context.newPage(), chatRequests = [];
  page.on("request", request => { if (request.url().includes("/api/chatkit")) chatRequests.push(request.url()); });
  await page.goto("http://127.0.0.1:3000/debugger-lab/workflow", { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.getByRole("heading", { name: "Paper-flight animation test fixture", exact: true }).waitFor();
  const card = page.locator("[data-arrived-node]");
  await page.evaluate(() => {
    window.__flightHistory = [];
    new MutationObserver(() => { const card = document.querySelector("[data-arrived-node]"); if (card) window.__flightHistory.push({ arrived: card.dataset.arrivedNode, target: card.dataset.flightTarget }); }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-arrived-node", "data-flight-target"] });
  });
  await page.getByRole("button", { name: "Rapid general stages", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-arrived-node]")?.dataset.flightTarget === "access");
  assert.equal(await card.getAttribute("data-arrived-node"), "sending");
  assert.equal(await page.locator('[data-workflow-node="hubstaff"]').count(), 0);
  await page.evaluate(() => {
    const paper = document.querySelector('[data-flying="true"]'), animation = paper.getAnimations()[0];
    animation.pause(); animation.currentTime = animation.effect.getTiming().duration * .55;
  });
  const arc = await page.evaluate(() => {
    const plane = document.querySelector('[data-flying="true"]').getBoundingClientRect();
    const origin = document.querySelector('[data-workflow-node="sending"] span').getBoundingClientRect();
    return { paperY: plane.y + plane.height / 2, nodeY: origin.y + origin.height / 2 };
  });
  assert.ok(arc.paperY < arc.nodeY - 12);
  await mkdir("test-results", { recursive: true });
  await page.screenshot({ path: "test-results/workflow-flight-desktop.png" });
  await page.evaluate(() => document.querySelector('[data-flying="true"]').getAnimations()[0].play());
  await page.waitForFunction(() => document.querySelector("[data-arrived-node]")?.dataset.arrivedNode === "backend");
  const history = await page.evaluate(() => window.__flightHistory);
  assert.ok(history.some(item => item.arrived === "access"));
  assert.ok(history.findIndex(item => item.target === "access") < history.findIndex(item => item.target === "backend"));
  check("batched progress visibly visits the portal before the AI service, on a curved throw");
  await page.getByRole("button", { name: "Response streaming", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-arrived-node]")?.dataset.flightTarget === "stream");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.waitForTimeout(320);
  assert.ok(await card.evaluate(node => Number(getComputedStyle(node).opacity) < .05));
  await card.waitFor({ state: "detached", timeout: 1500 });
  check("cancelling mid-flight stops movement and fades the loader immediately");
  await page.getByRole("button", { name: "Rapid work stages", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-arrived-node]")?.dataset.arrivedNode === "backend");
  assert.ok(await page.evaluate(() => window.__flightHistory.some(item => item.arrived === "hubstaff")));
  await page.getByRole("button", { name: "Complete", exact: true }).click();
  await card.waitFor({ state: "detached", timeout: 1500 });
  check("work-data hops are preserved and completion dismisses without delaying a reply");
  await page.getByRole("button", { name: "Rapid general stages", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-arrived-node]")?.dataset.flightTarget === "access");
  await page.setViewportSize({ width: 390, height: 760 });
  await page.waitForFunction(() => document.querySelector('[data-flying="true"]')?.getAnimations().length > 0);
  await page.evaluate(() => { const animation = document.querySelector('[data-flying="true"]').getAnimations()[0]; animation.pause(); animation.currentTime = animation.effect.getTiming().duration * .55; });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  await page.screenshot({ path: "test-results/workflow-flight-mobile.png" });
  await page.getByRole("button", { name: "Rapid work stages", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-arrived-node]")?.dataset.arrivedNode === "backend");
  check("resize and a new request during flight reset cleanly on mobile");
  await page.getByRole("button", { name: "Error", exact: true }).click();
  await card.waitFor({ state: "detached", timeout: 1500 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.getByRole("button", { name: "Rapid work stages", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[data-arrived-node]")?.dataset.arrivedNode === "backend");
  assert.equal(await page.locator('[data-flying="true"]').count(), 0);
  assert.equal(chatRequests.length, 0);
  check("reduced-motion mode and error cleanup work without making any AI calls");
} catch (error) { report.error = error.message; process.exitCode = 1; console.error(error.message); }
finally { await mkdir("test-results", { recursive: true }); await writeFile("test-results/workflow-flight.json", JSON.stringify(report, null, 2)); await context.close(); }
