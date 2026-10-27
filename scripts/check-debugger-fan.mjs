import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "@playwright/test";

// Real local requests + actual canvas interactions. The draw spy only reads
// rendered positions; it does not inject graph nodes or bypass authorization.
const context = await chromium.launchPersistentContext(".debugger-profile", { channel: "chrome", headless: true, viewport: { width: 1500, height: 1000 }, deviceScaleFactor: 1 });
const origin = "http://127.0.0.1:3000", report = { checks: [] };
const pass = name => { report.checks.push(name); console.log(`PASS ${name}`); };
await context.addInitScript(() => {
  const proto = CanvasRenderingContext2D.prototype, clear = proto.clearRect, text = proto.fillText, curve = proto.bezierCurveTo, move = proto.moveTo;
  const point = (ctx, x, y) => { const p = ctx.getTransform().transformPoint(new DOMPoint(x, y)); return { x: p.x / devicePixelRatio, y: p.y / devicePixelRatio }; };
  proto.clearRect = function (...args) {
    if (this.canvas.getAttribute("aria-label")?.startsWith("Live resource graph")) this.canvas.__fanFrame = { texts: [], links: [] };
    return clear.apply(this, args);
  };
  proto.fillText = function (label, x, y, ...args) {
    this.canvas.__fanFrame?.texts.push({ text: String(label), ...point(this, x, y) });
    return text.call(this, label, x, y, ...args);
  };
  proto.moveTo = function (x, y) { this.__fanStart = point(this, x, y); return move.call(this, x, y); };
  proto.bezierCurveTo = function (...args) {
    if (this.getLineDash().join(",") === "7,4") this.canvas.__fanFrame?.links.push({ from: this.__fanStart, to: point(this, args[4], args[5]) });
    return curve.apply(this, args);
  };
});
try {
  const normal = context.pages()[0] || await context.newPage();
  await normal.goto(origin, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await normal.waitForFunction(() => Boolean(window.__AOC_DEBUGGER__), null, { timeout: 90_000 });
  await normal.evaluate(() => Promise.all(["data.json", "slow.json"].flatMap(path => [0, 1].map(i => fetch(`/debugger-lab/${path}?fan=${i}`).then(response => response.json())))));
  const tabId = await normal.evaluate(() => window.__AOC_DEBUGGER__.tabId);
  const page = await context.newPage();
  await page.goto(`${origin}/?debugger=true`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.bringToFront();
  await page.getByLabel("Monitored tab", { exact: true }).selectOption(tabId);
  await page.getByLabel("Resource category", { exact: true }).selectOption("api");
  await page.getByLabel("Search resources", { exact: true }).fill("/debugger-lab/");
  const canvas = page.locator("canvas"), host = page.locator("[data-graph-nodes]");
  await page.waitForFunction(() => document.querySelector("[data-graph-nodes]")?.dataset.graphNodes === "2");
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  await page.getByRole("button", { name: "Zoom out", exact: true }).click({ clickCount: 2 });
  await canvas.scrollIntoViewIfNeeded();
  const snapshot = () => canvas.evaluate(node => node.__fanFrame);
  const label = (frame, name) => frame.texts.find(value => value.text === `GET /debugger-lab/${name}.json`);
  const hub = (frame, name = "data") => {
    const caption = label(frame, name); assert.ok(caption, `Missing painted ${name} group`);
    return frame.texts.filter(value => /^\d+$/.test(value.text) && Math.abs(value.x - caption.x) < .1 && value.y < caption.y).at(-1);
  };
  const children = frame => frame.texts.filter(value => value.text === "↔");
  const clickHub = async () => { const p = hub(await snapshot()), box = await canvas.boundingBox(); await page.mouse.dblclick(box.x + p.x, box.y + p.y); };
  const opened = async count => page.waitForFunction(n => {
    const canvas = document.querySelector("canvas"), host = document.querySelector("[data-graph-nodes]");
    return host?.dataset.groupLinks === String(n) && host.dataset.graphMotion === "idle" && canvas?.__fanFrame?.texts.filter(value => value.text === "↔").length === n;
  }, count);
  const close = async () => { await clickHub(); await page.waitForFunction(() => document.querySelector("[data-graph-nodes]")?.dataset.expandedGroups === "0"); };
  let count = 2;
  for (const [name, sx, sy] of [["northwest", -1, -1], ["northeast", 1, -1], ["southwest", -1, 1], ["southeast", 1, 1]]) {
    const frame = await snapshot(), before = hub(frame), other = hub(frame, "slow"), box = await canvas.boundingBox();
    const target = { x: box.width / 2 + sx * 100, y: box.height / 2 + sy * 65 };
    await page.mouse.move(box.x + before.x, box.y + before.y); await page.mouse.down();
    await page.mouse.move(box.x + target.x, box.y + target.y, { steps: 12 }); await page.mouse.up();
    await page.waitForTimeout(150);
    const anchor = hub(await snapshot());
    await clickHub(); await opened(count);
    const after = await snapshot(), stable = hub(after), points = children(after);
    assert.ok(Math.hypot(stable.x - anchor.x, stable.y - anchor.y) < 1, "Hub moved while opening");
    assert.ok(Math.hypot(hub(after, "slow").x - other.x, hub(after, "slow").y - other.y) < 1, "Unrelated group moved");
    assert.ok(points.every(p => (p.x - stable.x) * sx > 0 && (p.y - stable.y) * sy > 0), `${name} children left their sector`);
    assert.equal(after.links.length, count);
    assert.ok(after.links.every(link => Math.hypot(link.from.x - stable.x, link.from.y - stable.y) < 1));
    await page.getByRole("heading", { name: `Same endpoint · ${count} captured requests`, exact: true }).waitFor();
    pass(`${name}: smooth local fan, fixed hub, connected members and unchanged neighboring group`);
    if (name === "northwest") {
      await normal.evaluate(() => fetch("/debugger-lab/data.json?fan=2").then(response => response.json()));
      count = 3; await opened(count);
      const appended = children(await snapshot());
      assert.ok(points.every(old => appended.some(p => Math.hypot(old.x - p.x, old.y - p.y) < 1)));
      pass("new live member is added without moving the two already expanded requests");
      const ownHub = hub(await snapshot()), beforeDrag = children(await snapshot());
      await page.mouse.move(box.x + ownHub.x, box.y + ownHub.y); await page.mouse.down();
      await page.mouse.move(box.x + ownHub.x + 30, box.y + ownHub.y + 20, { steps: 8 }); await page.mouse.up();
      await page.waitForTimeout(150);
      const moved = children(await snapshot());
      assert.ok(beforeDrag.every(old => moved.some(p => Math.hypot(p.x - old.x - 30, p.y - old.y - 20) < 1)));
      pass("dragging an expanded hub carries its entire connected fan together");
    }
    await mkdir("test-results", { recursive: true });
    await page.getByLabel("Graph and resource inspector workspace", { exact: true }).screenshot({ path: `test-results/debugger-fan-${name}.png` });
    await close();
    assert.equal(await host.getAttribute("data-graph-nodes"), "2");
  }
  pass("double-clicking each original numbered hub collapses only its own fan");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.getByLabel("Monitored tab", { exact: true }).selectOption(tabId);
  await page.getByLabel("Resource category", { exact: true }).selectOption("api");
  await page.getByLabel("Search resources", { exact: true }).fill("/debugger-lab/");
  await page.waitForFunction(() => document.querySelector("[data-graph-nodes]")?.dataset.graphNodes === "2");
  await page.getByRole("button", { name: "Fit graph", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.__fanFrame?.texts.some(p => p.text === "GET /debugger-lab/data.json"));
  await page.evaluate(() => {
    window.__fanMotions = [];
    new MutationObserver(() => window.__fanMotions.push(document.querySelector("[data-graph-nodes]").dataset.graphMotion)).observe(document.querySelector("[data-graph-nodes]"), { attributes: true, attributeFilter: ["data-graph-motion"] });
  });
  await clickHub(); await opened(3);
  assert.ok(await page.evaluate(() => !window.__fanMotions.includes("opening")));
  pass("reduced-motion preference opens the same connected layout without animation");
} catch (error) { process.exitCode = 1; report.error = error.message; console.error(error.stack); }
finally { await mkdir("test-results", { recursive: true }); await writeFile("test-results/debugger-fan.json", JSON.stringify(report, null, 2)); await context.close(); }
