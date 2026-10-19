// Shared, browser-safe trace format. All transports pass through this sanitizer.
export const MAX_RECORDS = 2500;
export const MAX_BODY = 12_000;
const SECRET_KEY = /authorization|cookie|token|secret|password|credential|api.?key|signature|session|prompt|message|content|email|phone|address/i;
const SAFE_HEADERS = /^(content-type|content-length|cache-control|age|expires|last-modified|etag|server-timing|timing-allow-origin|vary|content-encoding|accept|accept-encoding|priority|sec-fetch-mode)$/i;
export function cleanText(value, limit = 1500) {
  return String(value ?? "").slice(0, limit)
    .replace(/\b(?:Bearer\s+)[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\b(?:sk-(?:or-v1-|proj-)?|hsoat_|npg_)[\w-]+/g, "[redacted]")
    .replace(/\beyJ[\w-]+\.[\w-]+\.[\w-]+/g, "[redacted]")
    .replace(/((?:password|token|secret|api[_-]?key|cookie|authorization)\s*[:=]\s*)[^\s&,;]+/gi, "$1[redacted]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email redacted]")
    .replace(/\b(?:https?|wss?):\/\/[^\s<>"']+/gi, (raw) => {
      try {
        const url = new URL(raw); url.username = ""; url.password = ""; url.hash = "";
        for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[redacted]");
        return url.href;
      } catch { return "[URL omitted]"; }
    });
}
export function cleanUrl(value, origin = "http://127.0.0.1:3000") {
  try {
    const url = new URL(String(value), origin);
    if (!["http:", "https:", "ws:", "wss:"].includes(url.protocol)) return "[non-network URL]";
    url.username = ""; url.password = ""; url.hash = "";
    for (const key of [...url.searchParams.keys()]) url.searchParams.set(key, "[redacted]");
    url.pathname = url.pathname.split("/").map((part) => part.length > 90 ? "[redacted]" : cleanText(part, 180)).join("/");
    return url.href.slice(0, 2000);
  } catch { return "[unavailable URL]"; }
}
export function cleanHeaders(headers) {
  const entries = typeof headers?.entries === "function" ? [...headers.entries()] : Object.entries(headers || {});
  return Object.fromEntries(entries.filter(([key]) => SAFE_HEADERS.test(key)).slice(0, 25).map(([key, value]) => [key.toLowerCase(), cleanText(value, 500)]));
}
export function cleanPayload(value, depth = 0) {
  if (depth > 5) return "[depth limit]";
  if (Array.isArray(value)) return value.slice(0, 25).map((item) => cleanPayload(item, depth + 1));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).slice(0, 40).map(([key, item]) => [cleanText(key, 80), SECRET_KEY.test(key) ? "[redacted]" : cleanPayload(item, depth + 1)]));
  return typeof value === "string" ? cleanText(value, 800) : value;
}
export function safeBody(text) {
  try { return JSON.stringify(cleanPayload(JSON.parse(text)), null, 2).slice(0, MAX_BODY); }
  catch { return "Body omitted: only structured JSON previews are supported."; }
}
export function categoryFor(url, initiator = "", mime = "") {
  const hint = `${initiator} ${mime}`.toLowerCase();
  if (/document|navigation|iframe/.test(hint)) return "document";
  if (/image|img/.test(hint) || /\.(png|jpe?g|avif|webp|gif|svg|ico)(\?|$)/i.test(url)) return "image";
  if (/css|stylesheet/.test(hint) || /\.css(\?|$)/i.test(url)) return "css";
  if (/font/.test(hint) || /\.(woff2?|ttf|otf)(\?|$)/i.test(url)) return "font";
  if (/script/.test(hint) || /\.m?js(\?|$)/i.test(url)) return "script";
  if (/websocket/.test(hint)) return "websocket";
  if (/eventsource/.test(hint)) return "eventsource";
  if (/video|audio|media/.test(hint)) return "media";
  if (/fetch|xmlhttprequest|xhr|json/.test(hint)) return "api";
  return "other";
}
export function statusColor(record) {
  if (record.state === "cancelled") return "#7e8a9c";
  if (record.state === "pending" || record.state === "receiving") return "#35d8f3";
  if (record.category === "error") return "#ff536b";
  const s = record.status;
  if (s === 401 || s === 403) return "#fb923c";
  if (s === 408 || s === 429) return "#c084fc";
  if (s >= 500) return "#ff536b";
  if (s >= 400) return "#facc64";
  if (record.state === "failed") return "#ff536b";
  if (s >= 300) return "#60a5fa";
  if (s >= 200) return "#34d399";
  return "#8995aa";
}
export function isError(record) { return record.category === "error" || record.state === "failed" || record.status >= 400; }
export function warningsFor(record, slowMs = 1500) {
  const warnings = [];
  if (isError(record)) warnings.push("Failed resource / operation");
  if (record.duration > slowMs) warnings.push(record.thirdParty ? "Slow third-party request" : "Slow request");
  if (record.transferSize > 500_000) warnings.push("Large transfer");
  if (record.renderBlocking === "blocking") warnings.push("Render-blocking resource");
  if (record.image?.naturalWidth > record.image?.width * 2.5 && record.image?.width > 0) warnings.push("Potentially oversized image");
  if (record.lcp) warnings.push("Observed LCP resource");
  if (record.category === "performance" && /long/.test(record.label || "")) warnings.push("Long main-thread task");
  return warnings;
}
const IDS = /^[a-zA-Z0-9_.:-]{1,180}$/;
export function sanitizeRecord(input) {
  if (!input || !IDS.test(input.id || "")) return null;
  const result = { id: input.id };
  for (const field of ["tabId", "navigationId", "parentId", "traceId"]) if (IDS.test(input[field] || "")) result[field] = input[field];
  for (const field of ["url", "initiatorUrl", "pageUrl"]) if (input[field]) result[field] = cleanUrl(input[field]);
  for (const field of ["label", "category", "source", "state", "method", "protocol", "cache", "priority", "initiatorType", "relationship", "renderBlocking", "error", "stack", "mime", "observation", "mode"]) {
    if (input[field] != null) result[field] = cleanText(input[field], field === "stack" ? 3000 : 800);
  }
  for (const field of ["start", "end", "duration", "headersAt", "status", "transferSize", "encodedSize", "decodedSize", "messagesSent", "messagesReceived", "callbackMs", "seen", "revision"]) {
    if (typeof input[field] === "number" && Number.isFinite(input[field]) && input[field] >= 0) result[field] = input[field];
  }
  for (const field of ["thirdParty", "lcp", "serviceWorker"]) if (typeof input[field] === "boolean") result[field] = input[field];
  if (input.requestHeaders) result.requestHeaders = cleanHeaders(input.requestHeaders);
  if (input.responseHeaders) result.responseHeaders = cleanHeaders(input.responseHeaders);
  if (input.timing) result.timing = Object.fromEntries(Object.entries(input.timing).slice(0, 15).filter(([, v]) => v != null && Number.isFinite(v) && v >= 0));
  if (input.metrics) result.metrics = Object.fromEntries(Object.entries(input.metrics).filter(([k, v]) => ["TTFB", "FCP", "LCP", "CLS", "INP", "DCL", "Load"].includes(k) && Number.isFinite(v) && v >= 0));
  if (input.image) result.image = Object.fromEntries(Object.entries(input.image).filter(([k, v]) => ["width", "height", "naturalWidth", "naturalHeight"].includes(k) && Number.isFinite(v) && v >= 0));
  if (input.responsePreview) result.responsePreview = safeBody(input.responsePreview);
  if (input.payload) result.payload = cleanPayload(input.payload);
  return result;
}
export function mergeRecords(map, records, maximum = MAX_RECORDS) {
  for (const input of records) {
    const record = sanitizeRecord(input);
    if (!record) continue;
    const previous = map.get(record.id);
    if (previous?.revision != null && record.revision != null && record.revision < previous.revision) {
      // A late start packet may carry immutable metadata missing from an early
      // terminal update. Fill holes without rewinding the newer lifecycle.
      map.set(record.id, { ...record, ...previous, ...(record.timing || previous.timing ? { timing: { ...record.timing, ...previous.timing } } : {}) });
      continue;
    }
    const merged = { ...previous, ...record };
    if (["complete", "closed", "failed", "cancelled"].includes(previous?.state) && ["pending", "receiving"].includes(record.state)) merged.state = previous.state;
    if (["failed", "cancelled"].includes(previous?.state) && record.state === "complete") merged.state = previous.state;
    map.set(record.id, merged);
  }
  while (map.size > maximum) {
    let victim, oldest = Infinity, priority = Infinity;
    for (const [key, record] of map) {
      const rank = ["pending", "receiving"].includes(record.state) ? 1 : 0;
      const time = record.end ?? record.start ?? record.seen ?? 0;
      if (rank < priority || (rank === priority && time < oldest)) { victim = key; priority = rank; oldest = time; }
    }
    map.delete(victim ?? map.keys().next().value);
  }
  return map;
}
export function acknowledgeTraceBatch(queue, batch) {
  for (const record of batch) if (queue.get(record.id)?.revision === record.revision) queue.delete(record.id);
}
// A timestamp match never creates a causal edge. Unknown initiators retain only
// the explicitly named navigation association.
export function relationships(records) {
  const ids = new Set(records.map((r) => r.id));
  const byUrl = new Map();
  for (const record of records) if (record.url && !["navigation", "error", "performance", "operation"].includes(record.category)) {
    const key = `${record.tabId}:${record.navigationId}:${record.url}`;
    byUrl.set(key, [...(byUrl.get(key) || []), record.id]);
  }
  return records.flatMap((record) => {
    if (record.parentId && ids.has(record.parentId) && record.parentId !== record.id) return [{ from: record.parentId, to: record.id, kind: record.relationship || "initiator" }];
    const candidates = byUrl.get(`${record.tabId}:${record.navigationId}:${record.initiatorUrl}`) || [];
    if (candidates.length === 1 && candidates[0] !== record.id) return [{ from: candidates[0], to: record.id, kind: "initiator source" }];
    if (ids.has(record.navigationId) && record.id !== record.navigationId) return [{ from: record.navigationId, to: record.id, kind: "navigation association" }];
    return [];
  });
}
