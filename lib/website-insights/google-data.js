import { propertyCoversWebsite } from "./policy.js";

// One device is measured per resumable batch. Keep the route and job lease
// longer than this budget. Omit full-page screenshots and unrelated diagnostics;
// Google does not accept per-entry subfield masks for its dynamic audit map.
export const PAGESPEED_TIMEOUT_MS = 90_000;
const PAGESPEED_FIELDS = "loadingExperience,lighthouseResult(fetchTime,runtimeError,categories,audits)";
const unavailable = (code, message) => ({ status: "unavailable", code, message });

export async function boundedJson(response, maximum = 5_000_000) {
  const reader = response.body.getReader(); let bytes = 0; const parts = [];
  try {
    while (true) {
      const { done, value } = await reader.read(); if (done) break;
      bytes += value.byteLength;
      if (bytes > maximum) { await reader.cancel(); throw new Error("response_limit"); }
      parts.push(Buffer.from(value));
    }
    return JSON.parse(Buffer.concat(parts).toString("utf8"));
  } finally { reader.releaseLock(); }
}
export function performanceData(payload) {
  const lighthouse = payload?.lighthouseResult;
  if (!lighthouse || lighthouse.runtimeError) return unavailable("lab_failed", "Google could not finish this website's lab test. Try another analysis later; no performance score was returned.");
  const scores = Object.fromEntries(["performance", "accessibility", "seo", "best-practices"].map(id =>
    [id, typeof lighthouse.categories?.[id]?.score === "number" && Number.isFinite(lighthouse.categories[id].score)
      && lighthouse.categories[id].score >= 0 && lighthouse.categories[id].score <= 1 ? Math.round(lighthouse.categories[id].score * 100) : null]));
  if (Object.values(scores).every(score => score === null)) return unavailable("missing_scores", "Google returned no usable lab scores. Run another analysis to retry; missing scores are not zero.");
  const audits = lighthouse.audits || {};
  const opportunities = Object.entries(audits).filter(([, audit]) => audit.score === 0 && audit.scoreDisplayMode !== "notApplicable")
    .slice(0, 8).map(([id, audit]) => ({ id, title: String(audit.title || id).slice(0, 200), description: String(audit.description || "").replace(/\[([^\]]+)\]\([^)]*\)/g, "$1").slice(0, 600) }));
  const field = payload.loadingExperience;
  return { status: "available", fetchedAt: lighthouse.fetchTime, scores, opportunities,
    lab: Object.fromEntries(["first-contentful-paint", "largest-contentful-paint", "total-blocking-time", "cumulative-layout-shift", "speed-index"]
      .map(id => [id, { value: audits[id]?.numericValue ?? null, display: audits[id]?.displayValue || "Unavailable" }])),
    field: field?.metrics && Object.keys(field.metrics).length ? { source: "CrUX field data", scope: "URL", metrics: field.metrics, category: field.overall_category }
      : { source: "CrUX", message: "No URL-level field data returned. Lab scores are not a Core Web Vitals field assessment." } };
}
export async function pageSpeed(url, strategy, { signal, fetchImpl = fetch, apiKey = process.env.PAGESPEED_INSIGHTS_API_KEY } = {}) {
  signal?.throwIfAborted();
  const endpoint = new URL("https://www.googleapis.com/pagespeedonline/v5/runPagespeed");
  endpoint.searchParams.set("url", url); endpoint.searchParams.set("strategy", strategy);
  endpoint.searchParams.set("fields", PAGESPEED_FIELDS);
  endpoint.searchParams.set("prettyPrint", "false");
  for (const category of ["performance", "accessibility", "seo", "best-practices"]) endpoint.searchParams.append("category", category);
  if (apiKey?.trim()) endpoint.searchParams.set("key", apiKey.trim());
  const timeout = AbortSignal.timeout(PAGESPEED_TIMEOUT_MS);
  try {
    const response = await fetchImpl(endpoint, { cache: "no-store", redirect: "error", signal: AbortSignal.any([timeout, ...(signal ? [signal] : [])]) });
    if (!response.ok) {
      // Interpret a bounded provider error, but never return its raw text/URLs
      // (which can contain the API key) to the client or application logs.
      const payload = await boundedJson(response, 30_000).catch(() => ({}));
      const details = Array.isArray(payload.error?.details) ? payload.error.details : [];
      const reasons = details.map(item => item.reason);
      if (response.status === 429) return unavailable("quota", apiKey?.trim()
        ? "Google PageSpeed quota reached for the configured project. Wait before running another analysis and check its PageSpeed API quota."
        : "Google PageSpeed anonymous quota reached. Configure PAGESPEED_INSIGHTS_API_KEY on the portal server, then run another analysis.");
      if (reasons.includes("SERVICE_DISABLED")) return unavailable("api_disabled", "Enable PageSpeed Insights API in the Google Cloud project that owns the configured API key, then run another analysis.");
      if (reasons.includes("API_KEY_INVALID") || /API key not valid/i.test(payload.error?.message || "")) return unavailable("key_invalid", "The PageSpeed API key was rejected. Check the portal's PAGESPEED_INSIGHTS_API_KEY setting; Google sign-in does not configure this key.");
      if (response.status === 403) return unavailable("access_denied", "Google denied the PageSpeed request. Check that PageSpeed Insights API is enabled and the API key's restrictions allow this server request.");
      return unavailable(response.status >= 500 ? "google_unavailable" : "request_rejected", response.status >= 500
        ? "Google PageSpeed is temporarily unavailable. Run another analysis later; the HTML report is still available."
        : "Google rejected the PageSpeed request. Check the API configuration; the HTML report is still available.");
    }
    return performanceData(await boundedJson(response, 5_000_000));
  } catch (error) {
    if (signal?.aborted) throw error;
    if (timeout.aborted || error?.name === "TimeoutError") return unavailable("timeout", "Google PageSpeed did not finish within 90 seconds for this device. Run another analysis to retry; the HTML report is still available.");
    if (error?.message === "response_limit") return unavailable("response_too_large", "Google returned a larger performance response than the portal can safely read. No score was saved; try another analysis later.");
    if (error instanceof SyntaxError) return unavailable("invalid_response", "Google returned an unreadable performance response. Run another analysis later; the HTML report is still available.");
    return unavailable("network", "The portal could not reach Google PageSpeed. Check the server's internet access or run another analysis later; no performance score was returned.");
  }
}
export function searchPeriods(now = Date.now()) {
  const day = 86400_000;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date(now)).filter(part => part.type !== "literal").map(part => [part.type, part.value]));
  const end = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) - 3 * day);
  const date = value => new Date(value).toISOString().slice(0, 10);
  return { current: { startDate: date(+end - 27 * day), endDate: date(+end) },
    previous: { startDate: date(+end - 55 * day), endDate: date(+end - 28 * day) } };
}
const number = value => typeof value === "number" && Number.isFinite(value) ? value : null;
function metrics(row) {
  return row ? { clicks: number(row.clicks), impressions: number(row.impressions), ctr: number(row.ctr), position: number(row.position) } : null;
}
export function searchData(periods, responses) {
  const [summary, previous, trend, queries, oldQueries, pages] = responses;
  const old = new Map((oldQueries.rows || []).map(row => [JSON.stringify(row.keys), row]));
  return { status: "available", periods, summary: metrics(summary.rows?.[0]), previous: metrics(previous.rows?.[0]),
    trend: (trend.rows || []).map(row => ({ date: row.keys[0], ...metrics(row) })),
    queries: (queries.rows || []).map(row => ({ query: String(row.keys[0]).slice(0, 500), page: String(row.keys[1]).slice(0, 1000), ...metrics(row),
      previousPosition: number(old.get(JSON.stringify(row.keys))?.position),
      previousImpressions: number(old.get(JSON.stringify(row.keys))?.impressions) })),
    pages: (pages.rows || []).map(row => ({ page: String(row.keys[0]).slice(0, 1000), ...metrics(row) })),
    note: "Google Search Console web-search averages, not exact live rankings. Reporting days use Pacific Time; finalized data ends three days before today. Top 200 query/page pairs and pages are sampled; anonymized queries and other rows may be omitted. A missing period is not assumed to be zero." };
}
export async function readSearchData(api, property, url, signal) {
  const properties = await api("https://www.googleapis.com/webmasters/v3/sites", undefined, signal);
  if (!propertyCoversWebsite(property, url) || !properties.siteEntry?.some(entry => entry.siteUrl === property && entry.permissionLevel !== "siteUnverifiedUser")) {
    return { status: "permission_required", message: "Google no longer confirms access to a matching property. Reconnect or choose an accessible property." };
  }
  const periods = searchPeriods();
  const endpoint = "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(property) + "/searchAnalytics/query";
  const requests = [
    { ...periods.current }, { ...periods.previous }, { ...periods.current, dimensions: ["date"] },
    { ...periods.current, dimensions: ["query", "page"] }, { ...periods.previous, dimensions: ["query", "page"] },
    { ...periods.current, dimensions: ["page"] },
  ];
  const responses = [];
  const host = new URL(url).hostname.replace(/^www\./, "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  // A domain property may contain OTHER stores/subdomains. Scope every query,
  // including totals, to the selected website, not the whole Google property.
  const dimensionFilterGroups = [{ groupType: "and", filters: [{ dimension: "page", operator: "includingRegex", expression: `^https://(www\\.)?${host}/` }] }];
  for (let index = 0; index < requests.length; index += 2) {
    responses.push(...await Promise.all(requests.slice(index, index + 2).map(input => api(endpoint, { ...input, type: "web", dataState: "final", rowLimit: 200, dimensionFilterGroups }, signal))));
  }
  return searchData(periods, responses);
}
