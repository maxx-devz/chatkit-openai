import test from "node:test";
import assert from "node:assert/strict";
import { websiteInput, sameWebsite, crawlUrl, propertyCoversWebsite, googleConfig } from "../lib/website-insights/policy.js";
import { publicAddress, resolvePublicHost, publicGet } from "../lib/website-insights/public-http.js";
import { parsePage, createAudit, crawlBatch, finalizeAudit, finding } from "../lib/website-insights/audit.js";
import { compareReports, reportCsv, safePageLink } from "../lib/website-insights/presentation.js";
import { performanceData, pageSpeed, searchData, searchPeriods, readSearchData, boundedJson } from "../lib/website-insights/google-data.js";
import { clientNavigation, clientView } from "../lib/client-navigation.js";
import { clientPermissionsForRole } from "../lib/client-permissions.js";
const root = "https://example.com/";
const response = (text, changes = {}) => ({ url: root, status: 200, headers: { "content-type": "text/html" }, text, ...changes });

test("websites accept public HTTPS roots, not credentials, IP literals, local domains or ports", () => {
  assert.deepEqual(websiteInput({ name: " Store ", url: "https://EXAMPLE.com/products?a=1" }), { name: "Store", url: root });
  for (const url of ["http://example.com", "https://user:pass@example.com", "https://127.0.0.1", "https://[::1]", "https://shop.local", "https://example.com:8443", "javascript:alert(1)"]) assert.throws(() => websiteInput({ name: "Store", url }));
  assert.throws(() => websiteInput({ name: "", url: root }));
});
test("only the same website (with www normalization) can be crawled; actions and query URLs are excluded", () => {
  assert.equal(sameWebsite("https://www.example.com/page", root), true);
  for (const url of ["https://example.com.evil.test", "https://shop.example.com", "https://evil.test", "http://example.com"]) assert.equal(sameWebsite(url, root), false);
  for (const url of ["/cart", "/checkout", "/logout", "/api/key", "/x?token=x", "https://evil.test/", "/image.png"]) assert.equal(crawlUrl(url, root), null);
  assert.equal(crawlUrl("/products#details", root), root + "products");
});
test("SSRF protection excludes all private, metadata, local, reserved and mapped-private addresses", async () => {
  for (const ip of ["127.0.0.1", "0.0.0.0", "10.2.3.4", "172.16.0.1", "192.168.0.1", "169.254.169.254", "100.100.100.200", "192.0.2.1", "224.0.0.1", "::1", "fc00::1", "fe80::1", "::ffff:127.0.0.1", "2001:db8::1"]) assert.equal(publicAddress(ip), false, ip);
  assert.equal(publicAddress("8.8.8.8"), true);
  await assert.rejects(resolvePublicHost("example.com", async () => [{ address: "8.8.8.8", family: 4 }, { address: "127.0.0.1", family: 4 }]), /public addresses/);
  await assert.rejects(publicGet("https://evil.test", { root }), /outside/);
  await assert.rejects(publicGet(root, { root, allowed: () => false }), /robots/);
});
test("HTML checks create observed findings and distinguish suggestions without executing scripts", () => {
  const page = parsePage(response('<html><head><title>Store</title><meta name="robots" content="noindex"><script type="application/ld+json">{invalid}</script></head><body><nav><a href="/products">Products</a></nav><img src="x"><img alt=""><h2>Details</h2><script>throw new Error("not executed")</script></body></html>'), root);
  for (const code of ["description-missing", "noindex", "alt-missing", "viewport-missing", "schema-invalid"]) assert.ok(page.findings.some(item => item.code === code));
  assert.ok(page.findings.find(item => item.code === "alt-missing").discovered.startsWith("1 image"));
  assert.ok(page.links.includes(root + "products"));
  assert.equal(page.findings.find(item => item.code === "schema-opportunity").kind, "suggestion");
  assert.ok(page.suggestedDescription);
});
test("valid JSON-LD is recorded as evidence, not a guarantee of rich-result eligibility", () => {
  const page = parsePage(response('<title>Helpful store title</title><meta name="description" content="A helpful page description with plenty of useful context for readers."><script type="application/ld+json">{"@graph":[{"@type":"Product"}]}</script><h1>Product</h1><h2>Details</h2>'), root);
  assert.ok(page.schemaTypes.includes("Product"));
  assert.ok(!page.findings.some(item => item.code === "schema-invalid" || item.code === "schema-opportunity"));
});
test("broken pages and uncertain access are not conflated", () => {
  assert.equal(parsePage(response("", { status: 404 }), root).findings[0].severity, "critical");
  assert.match(parsePage(response("", { status: 404 }), root).findings[0].title, /Broken/);
  assert.equal(parsePage(response("", { status: 403 }), root).findings[0].severity, "warning");
});
test("robot rules are honored in bounded resumable batches, with no external or private page request", async () => {
  const { state, result } = createAudit(root), calls = [];
  const read = async url => {
    calls.push(url);
    if (url.endsWith("robots.txt")) return response("User-agent: *\nDisallow: /private\n", { url });
    if (url.endsWith("sitemap.xml")) return response(`<urlset><url><loc>${root}private</loc></url><url><loc>${root}products</loc></url><url><loc>https://evil.test/</loc></url></urlset>`, { url });
    return response('<title>A useful store title</title><h1>Welcome</h1><a href="/private">Private</a><a href="/help">Help</a>', { url });
  };
  await crawlBatch(state, result, read);
  assert.equal(state.stage, "crawl");
  while (state.stage === "crawl") await crawlBatch(state, result, read);
  assert.equal(state.stage, "mobile");
  assert.ok(result.pages.length > 0);
  assert.equal(calls.includes(root + "private"), false);
  assert.equal(calls.some(url => url.includes("evil.test")), false);
  assert.ok(state.skipped > 0);
});
test("unavailable robots fails closed and does not claim pages were checked", async () => {
  const { state, result } = createAudit(root);
  await crawlBatch(state, result, async () => { throw new Error("timeout"); });
  assert.equal(state.stage, "mobile"); assert.equal(result.pages.length, 0);
});
test("page cap is enforced and duplicate evidence is limited to the actual sampled pages", async () => {
  const { state, result } = createAudit(root); state.stage = "crawl";
  const read = async url => response('<title>Duplicate title</title><meta name="description" content="same description">' + Array.from({ length: 30 }, (_, index) => `<a href="/p${index}">Page</a>`).join(""), { url });
  for (let i = 0; i < 20 && state.stage === "crawl"; i++) await crawlBatch(state, result, read);
  assert.equal(result.pages.length, 12);
  finalizeAudit(result);
  assert.ok(result.findings.some(item => item.code === "duplicate-title"));
  assert.equal(new Set(result.findings.map(item => item.id)).size, result.findings.length);
});
test("comparisons do not call unvisited/failed pages resolved", () => {
  const item = finding("missing", root, "seo", "warning", "Issue", "evidence", "why", "action");
  const old = { findings: [item], pages: [{ url: root, status: 200 }] };
  assert.equal(compareReports(old, { findings: [], pages: [] }).noLongerDetected.length, 0);
  assert.equal(compareReports(old, { findings: [], pages: [{ url: root, status: null }] }).noLongerDetected.length, 0);
  assert.equal(compareReports(old, { findings: [], pages: [{ url: root, status: 200 }] }).noLongerDetected.length, 1);
});
test("downloads neutralize spreadsheet formulas and links reject script/credential destinations", () => {
  assert.ok(reportCsv({ findings: [{ title: '=HYPERLINK("x")', page: "https://example.com" }] }).includes("'=HYPERLINK"));
  assert.equal(safePageLink("javascript:alert(1)"), undefined);
  assert.equal(safePageLink("https://user:pass@example.com"), undefined);
});
test("client navigation has real views, preserves permission-gated features and has no hash links", () => {
  const nav = clientNavigation(clientPermissionsForRole("client_viewer"));
  assert.ok(nav.some(item => item.view === "website-insights"));
  assert.ok(nav.every(item => item.href && !item.href.includes("#")));
  assert.equal(clientView("members", clientPermissionsForRole("member")), "dashboard");
  assert.equal(clientView("website-insights", clientPermissionsForRole("member")), "website-insights");
});
test("Search Console property matching prevents similarly named domains and sibling stores", () => {
  assert.equal(propertyCoversWebsite("sc-domain:example.com", "https://shop.example.com/"), true);
  assert.equal(propertyCoversWebsite("sc-domain:example.com", "https://example.com.evil.test/"), false);
  assert.equal(propertyCoversWebsite("https://shop.example.com/", "https://other.example.com/"), false);
  assert.equal(propertyCoversWebsite("http://example.com/", root), false);
});
test("OAuth configuration is a separate callback; no Drive or write scope is granted", () => {
  const config = googleConfig({ BETTER_AUTH_URL: "https://portal.example.com", WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID: "test", WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET: "fake", WEBSITE_INSIGHTS_ENCRYPTION_KEY: "x".repeat(32) });
  assert.equal(config.redirectUri, "https://portal.example.com/api/client/website-insights/google/callback");
  assert.throws(() => googleConfig({ BETTER_AUTH_URL: "http://evil.test" }));
});
test("Google data preserves unknown vs zero and average-position semantics", () => {
  const result = searchData({}, [{}, {}, {}, { rows: [{ keys: ["query", root], clicks: 0, impressions: 10, ctr: 0, position: 8.3 }] }, {}, {}]);
  assert.equal(result.summary, null); assert.equal(result.queries[0].clicks, 0); assert.equal(result.queries[0].position, 8.3);
  assert.equal(result.queries[0].previousPosition, null);
  assert.equal(result.queries[0].previousImpressions, null);
  assert.match(result.note, /not exact live rankings/);
});

test("keyword visibility changes use matched prior query-page rows rather than assumed zeros", () => {
  const current = { rows: [{ keys: ["store", root], clicks: 3, impressions: 90, ctr: .03, position: 6 }] };
  const previous = { rows: [{ keys: ["store", root], clicks: 1, impressions: 50, ctr: .02, position: 9 }] };
  const result = searchData({}, [{}, {}, {}, current, previous, {}]);
  assert.equal(result.queries[0].previousPosition, 9);
  assert.equal(result.queries[0].previousImpressions, 50);
});
test("Google periods use Pacific reporting dates and adjacent 28-day final windows", () => {
  const periods = searchPeriods(Date.parse("2026-10-30T02:00:00Z"));
  assert.equal(periods.current.endDate, "2026-10-26");
  assert.equal((Date.parse(periods.current.endDate) - Date.parse(periods.current.startDate)) / 86400000, 27);
  assert.equal((Date.parse(periods.current.startDate) - Date.parse(periods.previous.endDate)) / 86400000, 1);
});
test("every Google search request is filtered to the selected website, including domain-property totals", async () => {
  const calls = [];
  const api = async (url, body) => {
    calls.push({ url, body }); return body ? {} : { siteEntry: [{ siteUrl: "sc-domain:example.com", permissionLevel: "siteOwner" }] };
  };
  const result = await readSearchData(api, "sc-domain:example.com", "https://shop.example.com/");
  assert.equal(result.status, "available"); assert.equal(calls.length, 7);
  for (const { body } of calls.slice(1)) {
    const filter = body.dimensionFilterGroups[0].filters[0];
    assert.equal(filter.dimension, "page");
    const expression = new RegExp(filter.expression);
    assert.ok(expression.test("https://shop.example.com/product"));
    assert.ok(!expression.test("https://other.example.com/product"));
    assert.ok(!expression.test("https://shop.example.com.evil.test/product"));
  }
});
test("revoked property access never queries cached search data", async () => {
  let calls = 0;
  const result = await readSearchData(async () => { calls++; return { siteEntry: [] }; }, "sc-domain:example.com", root);
  assert.equal(calls, 1); assert.equal(result.status, "permission_required");
});
test("PageSpeed distinguishes lab scores from absent field data and unavailable external APIs", async () => {
  const result = performanceData({ lighthouseResult: { categories: { performance: { score: .9 } }, audits: {} } });
  assert.equal(result.scores.performance, 90); assert.equal(result.scores.accessibility, null);
  assert.ok(result.field.message.includes("not a Core Web Vitals"));
  const unavailable = await pageSpeed(root, "mobile", { fetchImpl: async () => new Response("private provider body", { status: 429 }) });
  assert.equal(unavailable.status, "unavailable"); assert.ok(!JSON.stringify(unavailable).includes("private"));
});
test("external JSON reads are size bounded", async () => { await assert.rejects(boundedJson(new Response('"' + "x".repeat(100) + '"'), 20), /response_limit/); });
