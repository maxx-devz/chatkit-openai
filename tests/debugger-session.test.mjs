import test from "node:test";
import assert from "node:assert/strict";
import { watchDebuggerSession } from "../lib/debugger/browser-session.js";

test("session watchdog ignores outages but clears capture on a verified account change", async (t) => {
  const originalWindow = globalThis.window, originalDocument = globalThis.document;
  const window = new EventTarget(), document = new EventTarget();
  document.hidden = false;
  globalThis.window = window; globalThis.document = document;
  t.after(() => { globalThis.window = originalWindow; globalThis.document = originalDocument; });
  let timer, current = 100_000, ended = 0, response = new Response(null, { status: 503 });
  t.mock.method(Date, "now", () => current);
  t.mock.method(globalThis, "setInterval", (callback) => { timer = callback; return 1; });
  t.mock.method(globalThis, "clearInterval", () => {});
  const dispose = watchDebuggerSession({ channel: "own-login" }, () => ended++, async () => response);
  await timer(); assert.equal(ended, 0);
  current += 11_000; response = Response.json({ channel: "own-login" });
  await timer(); assert.equal(ended, 0);
  current += 11_000; response = Response.json({ channel: "different-login" });
  await timer(); assert.equal(ended, 1);
  dispose(); current += 11_000;
  window.dispatchEvent(new Event("focus"));
  await timer(); assert.equal(ended, 1);
});
