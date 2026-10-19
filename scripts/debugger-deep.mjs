// Opt-in dedicated Chromium session. Playwright uses a private pipe, never a
// publicly listening remote-debugging TCP port or the user's normal profile.
import { chromium } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import nextEnv from "@next/env";
import { acknowledgeTraceBatch, categoryFor, cleanHeaders, cleanText, cleanUrl, safeBody, sanitizeRecord } from "../lib/debugger/model.js";

export async function attachDeepCapture(page, { origin = "http://127.0.0.1:3000", maxRecords = 2500 } = {}) {
  await page.addInitScript(() => { window.__AOC_DEEP_CAPTURE__ = true; });
  const cdp = await page.context().newCDPSession(page);
  await Promise.all([cdp.send("Network.enable", { maxTotalBufferSize: 2_000_000, maxResourceBufferSize: 32_000 }), cdp.send("Runtime.enable"), cdp.send("Page.enable"), cdp.send("Log.enable")]);
  const tree = await cdp.send("Page.getFrameTree");
  const mainFrame = tree.frameTree.frame.id;
  let currentLoader = tree.frameTree.frame.loaderId, active = false, flushing = false, metadata = null, dropped = 0;
  const queue = new Map(), requests = new Map(), navigations = new Map(), versions = new Map();
  const prefix = `cdp:${randomUUID()}`;
  function emit(value) {
    const record = sanitizeRecord(value); if (!record) return;
    record.revision = (versions.get(record.id) || 0) + 1; versions.set(record.id, record.revision);
    while (versions.size > maxRecords * 2) versions.delete(versions.keys().next().value);
    queue.set(record.id, { ...queue.get(record.id), ...record });
    while (queue.size > maxRecords) { queue.delete(queue.keys().next().value); dropped++; }
  }
  const header = (headers, key) => Object.entries(headers || {}).find(([k]) => k.toLowerCase() === key)?.[1];
  const livePage = (url) => { try { const parsed = new URL(url); return parsed.origin === origin && parsed.searchParams.get("debugger") !== "true"; } catch { return false; } };
  function finish(data, values) { if (!data) return; Object.assign(data.record, values); emit(data.record); }
  cdp.on("Network.requestWillBeSent", (event) => {
    if (event.type === "Document" && event.frameId === mainFrame) {
      active = livePage(event.request.url); currentLoader = event.loaderId;
      if (!active) { queue.clear(); requests.clear(); return; }
    }
    if (!active || /\/api\/debugger\//.test(event.request.url)) return;
    const old = requests.get(event.requestId), hop = old ? old.hop + 1 : 0;
    if (event.redirectResponse && old) finish(old, { state: "complete", status: event.redirectResponse.status, end: event.wallTime * 1000, duration: (event.timestamp - old.timestamp) * 1000, responseHeaders: cleanHeaders(event.redirectResponse.headers) });
    const debuggerId = header(event.request.headers, "x-aoc-debug-request");
    const id = debuggerId && /^[\w.:-]{1,180}$/.test(debuggerId) && hop === 0 ? debuggerId : `${prefix}:${event.requestId}:${hop}`;
    const initiator = event.initiator || {}, sourceFrame = initiator.stack?.callFrames?.[0];
    const record = { id, navigationId: `cdpnav:${currentLoader}`, source: "cdp", url: cleanUrl(event.request.url), category: categoryFor(event.request.url, event.type), method: event.request.method, state: "pending", start: event.wallTime * 1000,
      requestHeaders: cleanHeaders(event.request.headers), initiatorType: initiator.type, initiatorUrl: initiator.url || sourceFrame?.url, priority: event.request.initialPriority, thirdParty: new URL(event.request.url, origin).origin !== origin,
      observation: "CDP browser network event. Initiator links describe request initiation, not proof of execution dependency." };
    if (event.redirectResponse && old) { record.parentId = old.record.id; record.relationship = "redirect"; }
    else if (initiator.requestId && requests.has(initiator.requestId)) { record.parentId = requests.get(initiator.requestId).record.id; record.relationship = "CDP initiator request"; }
    requests.set(event.requestId, { record, timestamp: event.timestamp, rawUrl: event.request.url, hop });
    while (requests.size > maxRecords) requests.delete(requests.keys().next().value);
    emit(record);
  });
  cdp.on("Network.responseReceived", ({ requestId, response, timestamp }) => {
    const data = requests.get(requestId); if (!data) return;
    const timing = response.timing;
    const delta = (a, b) => timing && timing[a] >= 0 && timing[b] >= 0 ? Math.max(0, timing[a] - timing[b]) : undefined;
    finish(data, { state: "receiving", status: data.record.status === 304 ? 304 : response.status, headersAt: data.record.start + (timestamp - data.timestamp) * 1000, responseHeaders: cleanHeaders(response.headers), mime: response.mimeType, protocol: response.protocol, serviceWorker: response.fromServiceWorker,
      cache: response.fromDiskCache ? "disk cache" : response.fromPrefetchCache ? "prefetch cache" : response.fromServiceWorker ? "service worker" : data.record.cache || "network",
      timing: { dns: delta("dnsEnd", "dnsStart"), connect: delta("connectEnd", "connectStart"), tls: delta("sslEnd", "sslStart"), send: delta("sendEnd", "sendStart"), ttfb: delta("receiveHeadersStart", "sendEnd") } });
  });
  cdp.on("Network.dataReceived", ({ requestId, dataLength, encodedDataLength }) => {
    const data = requests.get(requestId); if (data) finish(data, { decodedSize: (data.record.decodedSize || 0) + dataLength, encodedSize: (data.record.encodedSize || 0) + encodedDataLength });
  });
  cdp.on("Network.responseReceivedExtraInfo", ({ requestId, statusCode }) => { const data = requests.get(requestId); if (data && statusCode === 304) finish(data, { status: 304, cache: "revalidated cache" }); });
  cdp.on("Network.requestServedFromCache", ({ requestId }) => { const data = requests.get(requestId); if (data) finish(data, { cache: "memory / local cache" }); });
  cdp.on("Network.loadingFinished", async ({ requestId, timestamp, encodedDataLength }) => {
    const data = requests.get(requestId); if (!data) return;
    finish(data, { state: "complete", end: data.record.start + (timestamp - data.timestamp) * 1000, duration: (timestamp - data.timestamp) * 1000, transferSize: encodedDataLength,
      timing: { ...data.record.timing, ...(data.record.headersAt ? { download: data.record.start + (timestamp - data.timestamp) * 1000 - data.record.headersAt } : {}) } });
    let url; try { url = new URL(data.rawUrl); } catch { return; }
    if (metadata?.config.captureBodies && metadata.config.bodyPaths.includes(url.pathname) && url.origin === origin && data.record.method === "GET" && /json/i.test(data.record.mime || "") && encodedDataLength > 0 && encodedDataLength <= 12_000) {
      try { const result = await cdp.send("Network.getResponseBody", { requestId }); if (!result.base64Encoded && result.body.length <= 12_000) finish(data, { responsePreview: safeBody(result.body) }); } catch { /* Body evicted or unavailable. */ }
    }
  });
  cdp.on("Network.loadingFailed", ({ requestId, timestamp, errorText, canceled, blockedReason, corsErrorStatus }) => {
    const data = requests.get(requestId); if (!data) return;
    finish(data, { state: canceled ? "cancelled" : "failed", end: data.record.start + (timestamp - data.timestamp) * 1000, duration: (timestamp - data.timestamp) * 1000,
      error: cleanText([errorText, blockedReason && `Blocked: ${blockedReason}`, corsErrorStatus && `CORS: ${corsErrorStatus.corsError}`].filter(Boolean).join(" · ")) });
  });
  cdp.on("Network.resourceChangedPriority", ({ requestId, newPriority }) => { const data = requests.get(requestId); if (data) finish(data, { priority: newPriority }); });
  cdp.on("Network.webSocketCreated", ({ requestId, url, initiator }) => {
    if (!active) return;
    const record = { id: `${prefix}:${requestId}:ws`, category: "websocket", url: cleanUrl(url), start: Date.now(), state: "pending", navigationId: `cdpnav:${currentLoader}`, initiatorUrl: initiator?.stack?.callFrames?.[0]?.url };
    requests.set(requestId, { record }); emit(record);
  });
  cdp.on("Network.webSocketHandshakeResponseReceived", ({ requestId, response }) => { const data = requests.get(requestId); if (data) finish(data, { state: "receiving", status: response.status, responseHeaders: cleanHeaders(response.headers) }); });
  for (const direction of ["Received", "Sent"]) cdp.on(`Network.webSocketFrame${direction}`, ({ requestId }) => { const data = requests.get(requestId); if (data) { const field = `messages${direction}`; finish(data, { [field]: (data.record[field] || 0) + 1 }); } });
  cdp.on("Network.webSocketClosed", ({ requestId }) => { const data = requests.get(requestId); if (data) finish(data, { state: "complete", end: Date.now(), duration: Date.now() - data.record.start }); });
  cdp.on("Network.webSocketFrameError", ({ requestId, errorMessage }) => { const data = requests.get(requestId); if (data) finish(data, { error: cleanText(errorMessage), state: "failed" }); });
  cdp.on("Network.eventSourceMessageReceived", ({ requestId }) => { const data = requests.get(requestId); if (data) finish(data, { messagesReceived: (data.record.messagesReceived || 0) + 1 }); });
  function exception(label, error, initiatorUrl, stack) { if (active) emit({ id: `${prefix}:error:${randomUUID()}`, navigationId: `cdpnav:${currentLoader}`, category: "error", label, source: "cdp", state: "failed", start: Date.now(), error: cleanText(error), initiatorUrl, stack: cleanText(stack, 3000) }); }
  cdp.on("Runtime.exceptionThrown", ({ exceptionDetails: d }) => exception("Runtime exception", d.exception?.description || d.text, d.url, JSON.stringify(d.stackTrace?.callFrames || [])));
  cdp.on("Runtime.consoleAPICalled", (event) => { if (event.type === "error" || event.type === "assert") exception("Console error", event.args.map((v) => v.description || v.value || v.type).join(" "), event.stackTrace?.callFrames?.[0]?.url); });
  cdp.on("Log.entryAdded", ({ entry }) => { if (entry.level === "error") exception(`Browser ${entry.source} error`, entry.text, entry.url); });
  async function flush() {
    if (flushing || page.isClosed() || !active) return;
    flushing = true;
    try {
      metadata = await page.evaluate(() => { const runtime = window.__AOC_DEBUGGER__; return runtime ? { tabId: runtime.tabId, navigationId: runtime.navigationId, config: runtime.config } : null; });
      if (!metadata) return; // Never transport records before developer authorization.
      if (currentLoader && !navigations.has(currentLoader)) navigations.set(currentLoader, metadata.navigationId);
      while (navigations.size > maxRecords) navigations.delete(navigations.keys().next().value);
      const batch = [...queue.values()].slice(0, 100).map((record) => ({ ...record, tabId: metadata.tabId, navigationId: navigations.get(record.navigationId?.replace(/^cdpnav:/, "")) || record.navigationId }));
      if (!batch.length) return;
      const delivered = await page.evaluate((values) => window.__AOC_DEBUGGER__?.ingestDeep(values) === true, batch);
      if (delivered) acknowledgeTraceBatch(queue, batch);
    } catch { /* Navigations temporarily destroy the JavaScript context. Retry after it returns. */ }
    finally { flushing = false; }
  }
  const timer = setInterval(flush, 120);
  page.once("close", () => clearInterval(timer));
  return { cdp, flush, stats: () => ({ pending: queue.size, dropped, requests: requests.size }), async dispose() { clearInterval(timer); await cdp.detach().catch(() => {}); } };
}
async function main() {
  nextEnv.loadEnvConfig(process.cwd(), true);
  if (process.env.DEBUGGER !== "true") throw new Error("Set DEBUGGER=true in .env.local before starting deep capture.");
  const origin = process.env.DEBUGGER_ORIGIN || "http://127.0.0.1:3000";
  const url = new URL(origin);
  if (!(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) || url.protocol !== "http:") throw new Error("Deep capture is restricted to a local HTTP portal.");
  const context = await chromium.launchPersistentContext(".debugger-profile", { channel: "chrome", headless: false, viewport: null });
  const attached = new WeakSet();
  const setup = async (page) => { if (attached.has(page)) return; attached.add(page); await attachDeepCapture(page, { origin: url.origin }); };
  context.on("page", (page) => { void setup(page); });
  const normal = context.pages()[0] || await context.newPage();
  await setup(normal);
  const shutdown = () => { void context.close(); };
  process.once("SIGINT", shutdown); process.once("SIGTERM", shutdown);
  // Development compilation and database authentication may take longer than
  // Playwright's default navigation timeout. A page load event is not needed.
  await normal.goto(url.origin, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => console.log("Portal navigation is still pending. You can open the local portal manually in this capture window."));
  const dashboard = await context.newPage(); await dashboard.goto(`${url.origin}/?debugger=true`, { waitUntil: "domcontentloaded", timeout: 120_000 }).catch(() => {});
  console.log("Dedicated Chrome capture is active. Sign in with an authorized developer account, then refresh the portal tab. Debugger data stays local and sanitized.");
  await new Promise((resolve) => context.on("close", resolve));
  process.removeListener("SIGINT", shutdown); process.removeListener("SIGTERM", shutdown);
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((error) => { console.error(error.message); process.exitCode = 1; });
