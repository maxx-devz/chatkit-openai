import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
import { categoryFor, cleanHeaders, cleanText, cleanUrl, mergeRecords, safeBody } from "./model";
import { DEBUG_HEADER, debugCommentObserver, readDebugHeader } from "./inline";
import { watchDebuggerSession } from "./browser-session";

export function startDebuggerCapture(config) {
  if (window.__AOC_DEBUGGER__ || new URL(location.href).searchParams.get("debugger") === "true") return () => {};
  const originalFetch = window.fetch;
  const records = new Map(), pending = new Map(), metrics = {};
  const observers = [], cleanups = [], observedResources = new Set(), requests = [];
  let active = true, timer = null, cost = 0, sequence = 0;
  let tabId;
  try {
    tabId = sessionStorage.getItem("aoc-debugger-tab") || `tab:${crypto.randomUUID()}`;
    sessionStorage.setItem("aoc-debugger-tab", tabId);
  } catch { tabId = `tab:${crypto.randomUUID()}`; }
  const navigationId = `nav:${crypto.randomUUID()}`;
  const deep = window.__AOC_DEEP_CAPTURE__ === true;
  const channel = new BroadcastChannel(config.channel);
  const now = () => performance.timeOrigin + performance.now();
  const id = () => `browser:${crypto.randomUUID()}`;
  const identity = { tabId, navigationId };
  const meta = () => ({ ...identity, pageUrl: cleanUrl(location.href), mode: deep ? "deep" : "baseline", metrics, callbackMs: Math.round(cost * 100) / 100, seen: Date.now(), closed: false, maxRecords: config.maxRecords });
  function flush() {
    timer = null;
    if (active && pending.size) {
      channel.postMessage({ type: "records", session: meta(), records: [...pending.values()] });
      pending.clear();
    }
  }
  function emit(record) {
    if (!active) return;
    const started = performance.now();
    mergeRecords(records, [{ ...identity, ...record, revision: record.revision ?? (records.get(record.id)?.revision || 0) + 1 }], config.maxRecords);
    const value = records.get(record.id);
    if (value) pending.set(value.id, value);
    if (pending.size > config.maxRecords) pending.delete(pending.keys().next().value);
    if (!timer) timer = setTimeout(flush, 120);
    cost += performance.now() - started;
  }
  const listen = (target, event, callback, options) => {
    const safe = (...args) => { try { callback(...args); } catch { /* Diagnostics are isolated. */ } };
    target.addEventListener(event, safe, options); cleanups.push(() => target.removeEventListener(event, safe, options));
  };
  const excluded = (url) => /\/api\/debugger(?:\/|\?|$)|[?&]debugger=true/.test(url);
  const allowedBody = (url, method) => config.captureBodies && method === "GET" && url.origin === location.origin && config.bodyPaths.includes(url.pathname);
  function startRequest(rawUrl, method, source, initiatorType) {
    const record = { id: id(), url: cleanUrl(rawUrl), method, source, initiatorType, category: categoryFor(rawUrl, initiatorType), start: now(), state: "pending", thirdParty: new URL(rawUrl, location.href).origin !== location.origin };
    const tracking = { id: record.id, rawUrl: new URL(rawUrl, location.href).href, perfStart: performance.now(), matched: false };
    requests.push(tracking); if (requests.length > config.maxRecords) requests.shift();
    if (!deep) emit(record);
    return record;
  }
  function traceHeaders(url, headers, requestId) {
    // Capabilities only go to these controlled, non-redirecting routes. Adding
    // them to arbitrary requests could forward a secret across a redirect or
    // introduce an otherwise unnecessary CORS preflight.
    if (url.origin !== location.origin || !["/api/chatkit", "/api/hubstaff", "/api/hubstaff/tasks", "/api/hubstaff/workflow"].includes(url.pathname)) return headers;
    const result = new Headers(headers);
    result.set("x-aoc-debug-token", config.token);
    result.set("x-aoc-debug-request", requestId);
    result.set("x-aoc-debug-tab", tabId);
    result.set("x-aoc-debug-navigation", navigationId);
    return result;
  }
  const wrappedFetch = async (input, init) => {
    const rawUrl = input instanceof Request ? input.url : String(input);
    const url = new URL(rawUrl, location.href);
    if (!active || excluded(url.href) || !/^https?:$/.test(url.protocol)) return originalFetch(input, init);
    if (/\/api\/auth\/(sign-out|sign-in|sign-up|switch-account)(?:\/|$)/.test(url.pathname)) { stop("access-ended"); return originalFetch(input, init); }
    const method = init?.method || (input instanceof Request ? input.method : "GET");
    const record = startRequest(url.href, method, "fetch", "fetch");
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((v, k) => headers.set(k, v));
    const debugHeaders = traceHeaders(url, headers, record.id);
    try {
      const response = await originalFetch(input, { ...init, headers: debugHeaders });
      const inline = debugHeaders.has("x-aoc-debug-token");
      const receiveInline = (batch) => { if (active) for (const record of batch) emit({ ...record, ...identity }); };
      if (inline) readDebugHeader(response.headers.get(DEBUG_HEADER), receiveInline);
      const comment = inline && response.headers.get("content-type")?.startsWith("text/event-stream") ? debugCommentObserver(receiveInline) : null;
      if (!deep) emit({ id: record.id, state: "receiving", status: response.status || undefined, headersAt: now(), requestHeaders: cleanHeaders(headers), responseHeaders: cleanHeaders(response.headers), mime: response.headers.get("content-type") });
      const finish = (state = "complete", error, preview) => {
        if (!deep) emit({ id: record.id, state, error, end: now(), duration: now() - record.start, ...(preview ? { responsePreview: preview } : {}) });
      };
      if ((deep && !comment) || !response.body || response.status === 0) { if (!deep) finish(); return response; }
      // Observe consumed bytes in the existing stream. No clone/tee or extra
      // body reader: ChatKit's backpressure and cancellation remain intact.
      const reader = response.body.getReader();
      let preview = "", previewBytes = 0;
      const previewAllowed = allowedBody(url, method) && /application\/json/i.test(response.headers.get("content-type") || "");
      const decoder = previewAllowed ? new TextDecoder() : null;
      const body = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) { finish("complete", undefined, previewAllowed && previewBytes <= 12_000 ? safeBody(preview + decoder.decode()) : undefined); controller.close(); }
            else {
              if (active) comment?.(value);
              if (previewAllowed) { previewBytes += value.byteLength; if (previewBytes <= 12_000) preview += decoder.decode(value, { stream: true }); else preview = ""; }
              controller.enqueue(value);
            }
          } catch (error) { finish(error?.name === "AbortError" ? "cancelled" : "failed", error?.name); controller.error(error); }
        },
        cancel(reason) { finish("cancelled"); return reader.cancel(reason); },
      });
      const observed = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      for (const prop of ["url", "redirected", "type"]) Object.defineProperty(observed, prop, { value: response[prop] });
      return observed;
    } catch (error) {
      if (!deep) emit({ id: record.id, state: error?.name === "AbortError" ? "cancelled" : "failed", error: `${error?.name || "NetworkError"}: ${cleanText(error?.message)}`, end: now(), duration: now() - record.start });
      throw error;
    }
  };
  window.fetch = wrappedFetch;
  cleanups.push(() => { if (window.fetch === wrappedFetch) window.fetch = originalFetch; });

  const xhrData = new WeakMap(), xhrPrototype = XMLHttpRequest.prototype;
  const open = xhrPrototype.open, send = xhrPrototype.send;
  function wrappedOpen(method, url, ...rest) { xhrData.set(this, { method, url: new URL(url, location.href).href }); return open.call(this, method, url, ...rest); }
  function wrappedSend(body) {
    const data = xhrData.get(this);
    if (!data || excluded(data.url) || !active) return send.call(this, body);
    if (/\/api\/auth\/(sign-out|sign-in|sign-up|switch-account)(?:\/|$)/.test(new URL(data.url).pathname)) { stop("access-ended"); return send.call(this, body); }
    const record = startRequest(data.url, data.method, "xhr", "xmlhttprequest");
    if (new URL(data.url).origin === location.origin) {
      const headers = traceHeaders(new URL(data.url), {}, record.id); headers.forEach((v, k) => this.setRequestHeader(k, v));
    }
    let terminal;
    for (const name of ["abort", "error", "timeout"]) this.addEventListener(name, () => { terminal = name; }, { once: true });
    this.addEventListener("loadend", () => {
      if (new URL(data.url).origin === location.origin) readDebugHeader(this.getResponseHeader(DEBUG_HEADER), (batch) => { for (const value of batch) emit({ ...value, ...identity }); });
      if (deep) return;
      const responseHeaders = Object.fromEntries(this.getAllResponseHeaders().trim().split(/[\r\n]+/).filter(Boolean).map((line) => { const split = line.indexOf(":"); return [line.slice(0, split), line.slice(split + 1).trim()]; }));
      emit({ id: record.id, state: terminal === "abort" ? "cancelled" : terminal ? "failed" : "complete", status: this.status || undefined, error: terminal, end: now(), duration: now() - record.start, responseHeaders });
    }, { once: true });
    return send.call(this, body);
  }
  xhrPrototype.open = wrappedOpen; xhrPrototype.send = wrappedSend;
  cleanups.push(() => { if (xhrPrototype.open === wrappedOpen) xhrPrototype.open = open; if (xhrPrototype.send === wrappedSend) xhrPrototype.send = send; });
  for (const kind of ["WebSocket", "EventSource"]) {
    const Native = window[kind]; if (!Native) continue;
    const Wrapped = new Proxy(Native, { construct(Target, args) {
      const connection = Reflect.construct(Target, args);
      if (!active || deep || excluded(String(args[0]))) return connection;
      const record = startRequest(args[0], "GET", kind.toLowerCase(), kind.toLowerCase());
      let received = 0;
      connection.addEventListener("open", () => emit({ id: record.id, state: "receiving", headersAt: now() }));
      connection.addEventListener("message", () => emit({ id: record.id, messagesReceived: ++received }));
      connection.addEventListener("error", () => emit({ id: record.id, error: `${kind} connection error; browser supplied no HTTP status.`, state: kind === "EventSource" && connection.readyState !== 2 ? "pending" : "failed" }));
      connection.addEventListener("close", () => emit({ id: record.id, state: "complete", end: now(), duration: now() - record.start }));
      if (kind === "EventSource") {
        const close = connection.close.bind(connection);
        connection.close = () => { emit({ id: record.id, state: "cancelled", end: now(), duration: now() - record.start }); return close(); };
      }
      return connection;
    } });
    window[kind] = Wrapped; cleanups.push(() => { if (window[kind] === Wrapped) window[kind] = Native; });
  }
  function observe(type, callback, options = {}) {
    if (!PerformanceObserver.supportedEntryTypes?.includes(type)) return;
    const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) { try { callback(entry); } catch { /* Unsupported fields are left absent. */ } } });
    try { observer.observe({ type, buffered: true, ...options }); observers.push(observer); } catch { observer.disconnect(); }
  }
  function imageInfo(rawUrl) {
    const image = [...document.images].find((img) => (img.currentSrc || img.src) === rawUrl);
    if (!image) return undefined;
    return { naturalWidth: image.naturalWidth, naturalHeight: image.naturalHeight, width: image.clientWidth, height: image.clientHeight };
  }
  function resource(entry) {
    if (deep || excluded(entry.name)) return;
    const key = `${entry.name}:${entry.startTime}`; if (observedResources.has(key)) return;
    observedResources.add(key); if (observedResources.size > config.maxRecords * 2) observedResources.delete(observedResources.values().next().value);
    const candidates = requests.filter((r) => !r.matched && r.rawUrl === entry.name && Math.abs(r.perfStart - entry.startTime) < 30);
    const match = /fetch|xmlhttprequest/.test(entry.initiatorType) && candidates.length === 1 ? candidates[0] : null;
    if (match) match.matched = true;
    const sameOrigin = new URL(entry.name).origin === location.origin;
    const detailed = sameOrigin || entry.responseStart > 0;
    const diff = (a, b) => detailed && entry[b] > 0 && entry[a] >= entry[b] ? entry[a] - entry[b] : undefined;
    const category = categoryFor(entry.name, entry.initiatorType);
    const previous = match && records.get(match.id);
    emit({ id: match?.id || id(), url: cleanUrl(entry.name), source: "resource-timing", initiatorType: entry.initiatorType, category, state: ["failed", "cancelled"].includes(previous?.state) ? previous.state : "complete", status: entry.responseStatus || undefined,
      start: performance.timeOrigin + entry.startTime, end: performance.timeOrigin + entry.responseEnd, duration: entry.duration,
      transferSize: detailed ? entry.transferSize : undefined, encodedSize: detailed ? entry.encodedBodySize : undefined, decodedSize: detailed ? entry.decodedBodySize : undefined,
      protocol: entry.nextHopProtocol || undefined, cache: detailed && entry.deliveryType === "cache" ? "browser cache" : detailed && entry.transferSize === 0 && entry.decodedBodySize > 0 ? "local cache (timing evidence)" : "unknown",
      renderBlocking: entry.renderBlockingStatus || undefined, thirdParty: !sameOrigin, image: category === "image" ? imageInfo(entry.name) : undefined,
      timing: { dns: diff("domainLookupEnd", "domainLookupStart"), connect: diff("connectEnd", "connectStart"), tls: diff("connectEnd", "secureConnectionStart"), ttfb: diff("responseStart", "requestStart"), download: diff("responseEnd", "responseStart"), redirect: diff("redirectEnd", "redirectStart") },
      observation: detailed ? "Resource timing is emitted after completion. Exact initiator, priority and bodies require deep capture." : "Cross-origin timing/status/size may be restricted by Timing-Allow-Origin." });
  }
  observe("resource", resource);
  emit({ id: navigationId, category: "navigation", label: "Page navigation", url: cleanUrl(location.href), start: performance.timeOrigin, state: "complete", source: "browser" });
  function navigation() {
    const entry = performance.getEntriesByType("navigation")[0]; if (!entry) return;
    if (!deep) emit({ id: `${navigationId}:document`, category: "document", url: cleanUrl(location.href), state: entry.loadEventEnd ? "complete" : "receiving", start: performance.timeOrigin, end: entry.responseEnd ? performance.timeOrigin + entry.responseEnd : undefined, duration: entry.responseEnd, status: entry.responseStatus || undefined, source: "navigation-timing", transferSize: entry.transferSize, encodedSize: entry.encodedBodySize, decodedSize: entry.decodedBodySize, protocol: entry.nextHopProtocol, timing: { dns: entry.domainLookupEnd - entry.domainLookupStart, connect: entry.connectEnd - entry.connectStart, ttfb: entry.responseStart - entry.requestStart, download: entry.responseEnd - entry.responseStart } });
    if (entry.domContentLoadedEventEnd) metrics.DCL = entry.domContentLoadedEventEnd;
    if (entry.loadEventEnd) metrics.Load = entry.loadEventEnd;
    emit({ id: navigationId });
  }
  navigation(); listen(window, "load", navigation); observe("navigation", navigation);
  const report = (metric) => { if (active) { metrics[metric.name] = metric.value; emit({ id: navigationId }); } };
  for (const register of [onCLS, onFCP, onINP, onLCP, onTTFB]) { try { register(report, { reportAllChanges: true }); } catch { /* Browser support varies. */ } }
  observe("largest-contentful-paint", (entry) => {
    if (!entry.url) return;
    const matches = [...records.values()].filter((r) => r.url === cleanUrl(entry.url));
    if (matches.length === 1) emit({ id: matches[0].id, lcp: true });
  });
  for (const type of ["longtask", "long-animation-frame", "layout-shift"]) observe(type, (entry) => {
    if (type === "layout-shift" && entry.hadRecentInput) return;
    emit({ id: id(), category: "performance", label: type, source: "performance-observer", state: "complete", start: performance.timeOrigin + entry.startTime, duration: entry.duration, observation: type === "layout-shift" ? `Observed layout shift value: ${entry.value}. No resource cause inferred.` : "Main-thread duration is separate from resource download time." });
  });
  listen(window, "error", (event) => {
    const element = event.target;
    const rawUrl = element?.currentSrc || element?.src || element?.href;
    if (rawUrl && !deep) {
      const matches = [...records.values()].filter((r) => r.url === cleanUrl(rawUrl));
      emit({ id: matches.length === 1 ? matches[0].id : id(), url: cleanUrl(rawUrl), category: categoryFor(rawUrl, element.tagName?.toLowerCase()), state: "failed", source: "resource-error", error: "Resource failed to load; browser error event supplies no HTTP status.", ...(matches.length === 1 ? {} : { start: now() }) });
    } else if (!deep && event.message) emit({ id: id(), category: "error", label: "Runtime exception", state: "failed", start: now(), source: "runtime", error: cleanText(event.message), stack: cleanText(event.error?.stack, 3000), initiatorUrl: event.filename ? cleanUrl(event.filename) : undefined });
  }, true);
  listen(window, "unhandledrejection", (event) => { if (!deep) emit({ id: id(), category: "error", label: "Unhandled rejection", state: "failed", start: now(), source: "runtime", error: cleanText(event.reason?.message || event.reason?.name || "Promise rejected"), stack: cleanText(event.reason?.stack, 3000) }); });
  listen(document, "securitypolicyviolation", (event) => {
    const url = /^https?:\/\//.test(event.blockedURI) ? cleanUrl(event.blockedURI) : undefined;
    const matches = url ? [...records.values()].filter((r) => r.url === url && r.category !== "error") : [];
    emit({ id: id(), category: "error", label: "CSP blocked resource", url, state: "failed", source: "csp", start: now(),
      ...(matches.length === 1 ? { parentId: matches[0].id, relationship: "CSP blocked resource" } : {}),
      error: `Blocked by ${event.effectiveDirective}${url ? "" : ` (${cleanText(event.blockedURI || "inline code", 100)})`}` });
  });
  channel.onmessage = (event) => {
    if (event.data?.type === "access-ended") { stop("access-ended", false); return; }
    if (event.data?.type === "snapshot-request") channel.postMessage({ type: "snapshot", session: meta(), records: [...records.values()] });
  };
  const presence = setInterval(() => { if (active) channel.postMessage({ type: "presence", session: meta() }); }, 15_000);
  cleanups.push(() => clearInterval(presence));
  function stop(reason = "closed", notify = true) {
    if (!active) return;
    if (reason === "closed") flush();
    active = false;
    clearTimeout(timer);
    for (const observer of observers) observer.disconnect();
    for (const cleanup of cleanups) cleanup();
    if (notify) channel.postMessage({ type: reason, tabId });
    channel.close(); records.clear(); pending.clear(); requests.length = 0;
    if (window.__AOC_DEBUGGER__?.tabId === tabId) delete window.__AOC_DEBUGGER__;
  }
  // Token expiry disables capture even when a long-lived layout never rerenders.
  const expiry = setTimeout(() => stop("access-ended"), Math.max(0, config.expiresAt - Date.now())); cleanups.push(() => clearTimeout(expiry));
  cleanups.push(watchDebuggerSession(config, () => stop("access-ended"), originalFetch.bind(window)));
  listen(window, "pagehide", (event) => { if (!event.persisted) stop(); });
  window.__AOC_DEBUGGER__ = {
    tabId, navigationId, config: { captureBodies: config.captureBodies, bodyPaths: config.bodyPaths },
    snapshot() { return { records: [...records.values()], metrics: { ...metrics }, mode: deep ? "deep" : "baseline" }; },
    ingestDeep(batch) {
      if (!deep || !active) return false;
      for (const record of batch.slice(0, 100)) {
        emit({ ...record, source: "cdp" });
      }
      return true;
    },
    route(url, type) { emit({ id: `route:${++sequence}:${navigationId}`, category: "navigation", label: `Route ${type}`, url: cleanUrl(url), start: now(), state: "complete", source: "next-router", observation: "Route transition start; resource parents are not inferred from timing." }); },
    stop,
  };
  channel.postMessage({ type: "presence", session: meta() });
  return stop;
}
