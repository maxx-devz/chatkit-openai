import { load } from "cheerio";
import robotsParser from "robots-parser";
import { createHash } from "node:crypto";
import { PAGE_LIMIT, crawlUrl } from "./policy.js";

const clean = (value, max = 1000) => String(value || "").replace(/\s+/g, " ").trim().slice(0, max);
const hash = value => createHash("sha256").update(value).digest("hex").slice(0, 20);
export function finding(code, page, category, severity, title, discovered, why, recommendation, kind = "finding") {
  return { id: hash(code + ":" + page), code, page, category, severity, title, discovered, why, recommendation, kind };
}
export function parsePage(response, root) {
  const { url, status, headers, text } = response;
  if (status !== 200 || !/text\/html|application\/xhtml\+xml/i.test(headers["content-type"] || "")) {
    return { url, status, title: "", description: "", links: [], findings: [finding("http-status", url, "seo", [404, 410].includes(status) || status >= 500 ? "critical" : "warning",
      [404, 410].includes(status) ? "Broken or removed internal page" : "Page could not be analyzed", `HTTP ${status}. ${status === 200 ? "The response was not HTML." : "No page content was analyzed."}`,
      "Search engines and visitors need an accessible page.", "Check this URL in your browser and investigate access rules, redirects or server errors.")] };
  }
  const $ = load(text);
  const title = clean($("title").first().text(), 300);
  const meta = name => clean($("meta").filter((_, el) => ($(el).attr("name") || "").toLowerCase() === name).first().attr("content"), 600);
  const description = meta("description"), robots = `${meta("robots")} ${meta("googlebot")} ${headers["x-robots-tag"] || ""}`;
  const h1 = $("h1").map((_, el) => clean($(el).text(), 200)).get();
  const canonicalRaw = $("link[rel~='canonical']").first().attr("href");
  let canonical = "";
  try { if (canonicalRaw) canonical = new URL(canonicalRaw, url).href; } catch { /* reported below */ }
  const findings = [];
  const add = (code, category, severity, heading, discovered, why, recommendation, kind) =>
    findings.push(finding(code, url, category, severity, heading, discovered, why, recommendation, kind));
  if (!title) add("title-missing", "seo", "warning", "Missing page title", "No non-empty title element was found.",
    "Titles help describe a page to visitors and search engines.", "Add a specific, useful title describing this page.");
  else if (title.length > 65 || title.length < 12) add("title-length", "seo", "opportunity", "Review the page title", `The title has ${title.length} characters.`,
    "Very short or long titles can be less descriptive or appear truncated. Length is only a heuristic.", "Use a concise, descriptive title; keep important information near the start.", "suggestion");
  if (!description) add("description-missing", "seo", "warning", "Missing meta description", "No non-empty meta description was found.",
    "A relevant description can help explain the page in search results; Google may choose different text.", "Write a distinct summary of the page and a useful reason to visit.");
  else if (description.length < 50 || description.length > 170) add("description-length", "seo", "opportunity", "Review the description", `The description has ${description.length} characters.`,
    "This length may leave out useful context or be truncated. It is not a ranking rule.", "Summarize this page clearly and naturally; avoid repeating the same description site-wide.", "suggestion");
  if (/\b(?:noindex|none)\b/i.test(robots)) add("noindex", "seo", "warning", "Indexing exclusion detected", "A robots meta tag or X-Robots-Tag contains noindex or none.",
    "This directive asks supported search engines not to index the page. It may be intentional.", "Confirm whether this page should appear in search; remove noindex only if appropriate.");
  if (canonicalRaw && !canonical) add("canonical-invalid", "seo", "warning", "Invalid canonical URL", "The canonical link could not be parsed.", "Canonical links help consolidate duplicate URLs.", "Use a valid absolute canonical URL.");
  if (!canonicalRaw) add("canonical-missing", "seo", "opportunity", "Consider a canonical URL", "No canonical link was found in the returned HTML.",
    "A canonical can clarify the preferred URL where duplicates exist.", "Review duplicate URLs and add a suitable canonical if needed.", "suggestion");
  if (!h1.length) add("h1-missing", "seo", "warning", "Missing main heading", "No H1 element was found.", "A clear main heading helps readers understand the page.", "Add a descriptive main heading that matches the page's purpose.");
  const missingAlt = $("img").filter((_, el) => $(el).attr("alt") === undefined).length;
  if (missingAlt) add("alt-missing", "accessibility", "warning", "Images without an alt attribute", `${missingAlt} image(s) have no alt attribute. Empty alt text was not counted as missing.`,
    "Text alternatives support people using screen readers.", "Describe meaningful images; use an empty alt attribute for decorative images.");
  if (!meta("viewport")) add("viewport-missing", "accessibility", "warning", "Missing mobile viewport", "No viewport meta tag was found.",
    "Mobile layouts may not scale as expected.", "Review responsive behavior and add a suitable viewport setting.");
  const schemaTypes = []; let invalidSchema = 0;
  $("script[type='application/ld+json']").each((_, el) => {
    try {
      const value = JSON.parse($(el).text());
      const visit = (node, depth = 0) => {
        if (!node || typeof node !== "object" || depth > 12) return;
        if (node["@type"]) schemaTypes.push(...[node["@type"]].flat().filter(v => typeof v === "string").map(v => v.slice(0, 80)));
        for (const item of Object.values(node)) if (typeof item === "object") visit(item, depth + 1);
      };
      visit(value);
    } catch { invalidSchema++; }
  });
  if (invalidSchema) add("schema-invalid", "seo", "warning", "Structured data is not valid JSON", `${invalidSchema} JSON-LD block(s) could not be parsed.`,
    "Invalid JSON can prevent systems from understanding the structured data.", "Validate the affected JSON-LD with Google's Rich Results Test. Valid JSON alone does not establish rich-result eligibility.");
  if (!schemaTypes.length) add("schema-opportunity", "geo", "opportunity", "Consider relevant structured information", "No JSON-LD types were detected in the returned HTML.",
    "Accurate structured information can clarify entities and page content for search systems.", "Where appropriate, add supported Product, Organization or Breadcrumb markup that matches visible content. This does not guarantee enhanced results or AI visibility.", "suggestion");
  if (!$("h2,h3").length) add("content-structure", "geo", "opportunity", "Make key answers easier to find", "No H2 or H3 subheadings were detected.",
    "Clear, well-organized explanations can help people and automated systems understand a page.", "Where useful, organize facts, product details or answers under descriptive headings. This is a content suggestion, not a measured AI-search ranking.", "suggestion");
  const links = [...new Set($("a[href]").map((_, el) => crawlUrl($(el).attr("href"), url)).get().filter(Boolean))].slice(0, 60);
  $("script,style,noscript,nav,header,footer").remove();
  const body = clean($("main").length ? $("main").text() : $("body").text(), 100_000);
  const suggestedTitle = title || h1[0] || `Explore ${new URL(root).hostname}`;
  return { url, status, title, description, h1, canonical, schemaTypes: [...new Set(schemaTypes)].slice(0, 30),
    words: body.split(/\s+/).filter(Boolean).length, contentHash: body.length > 800 ? hash(body.toLowerCase()) : null,
    links, findings, suggestedTitle: clean(suggestedTitle, 65),
    suggestedDescription: clean(description || `Explore ${h1[0] || title || new URL(root).hostname}. Find helpful information, product details and next steps on this page.`, 160) };
}

export function createAudit(url) {
  return { state: { stage: "discovery", queue: [url], visited: [], robots: "", skipped: 0 },
    result: { version: 1, root: url, pages: [], findings: [], coverage: { limit: PAGE_LIMIT, note: "Bounded public-HTML sample; not an exhaustive site crawl. JavaScript is not executed, external links are not fetched, and rendered-only content may be missed." },
      performance: {}, search: { status: "not_connected", message: "Connect Google Search Console for real search performance data." } } };
}
export function finalizeAudit(result) {
  const findings = result.pages.flatMap(page => page.findings || []);
  for (const [field, title] of [["title", "Duplicate page titles"], ["description", "Duplicate meta descriptions"], ["contentHash", "Potential duplicate page content"]]) {
    const groups = new Map();
    for (const page of result.pages.filter(page => page.status === 200)) {
      const key = String(page[field] || "").toLowerCase().trim();
      if (key) groups.set(key, [...(groups.get(key) || []), page.url]);
    }
    for (const pages of groups.values()) if (pages.length > 1) for (const page of pages) findings.push(finding("duplicate-" + field, page, "seo", "warning", title,
      `The same ${field === "contentHash" ? "visible text" : field} was found on ${pages.length} sampled pages.`,
      "Repeated metadata or substantial text can make pages harder to distinguish; duplication may be intentional.", "Review these pages for distinct purpose and useful content, or appropriate canonical handling."));
  }
  for (const [strategy, data] of Object.entries(result.performance)) {
    for (const item of data.opportunities || []) findings.push(finding(`psi-${strategy}-${item.id}`, result.root, "performance", "opportunity", item.title,
      `${strategy} Lighthouse lab audit: ${item.description}`, "This lab result identifies a possible performance or accessibility improvement on the homepage.",
      "Review this diagnostic with your developer and verify improvements under representative conditions.", "suggestion"));
  }
  result.findings = findings;
  result.summary = { critical: findings.filter(f => f.severity === "critical").length, warnings: findings.filter(f => f.severity === "warning").length,
    opportunities: findings.filter(f => f.severity === "opportunity").length, pagesChecked: result.pages.length };
  return result;
}

export async function crawlBatch(state, result, read, signal) {
  const root = result.root;
  if (state.stage === "discovery") {
    let robots;
    try { robots = await read(new URL("/robots.txt", root).href, { root, signal, maxBytes: 150_000 }); }
    catch { robots = { status: 503 }; }
    if (robots.status === 200) state.robots = robots.text;
    if (robots.status !== 200 && robots.status !== 404 && robots.status !== 410) {
      result.coverage.robots = "Could not verify robots.txt; HTML crawl skipped conservatively.";
      state.queue = []; state.stage = "mobile"; return;
    }
    result.coverage.robots = robots.status === 200 ? "robots.txt rules respected for AOCWebsiteInsights." : "No robots.txt file was found.";
    const parser = robotsParser(new URL("/robots.txt", root).href, state.robots);
    const sitemap = new URL("/sitemap.xml", root).href;
    if (parser.isAllowed(sitemap, "AOCWebsiteInsights") !== false) {
      try {
        const response = await read(sitemap, { root, signal, maxBytes: 200_000, allowed: candidate => parser.isAllowed(candidate, "AOCWebsiteInsights") !== false });
        if (response.status === 200) {
          const $ = load(response.text, { xmlMode: true });
          const urls = $("urlset > url > loc").map((_, el) => crawlUrl($(el).text(), root)).get().filter(Boolean);
          state.queue = [...new Set([...state.queue, ...urls])].slice(0, PAGE_LIMIT * 2);
          result.coverage.sitemap = `${urls.length} eligible URLs discovered in the root sitemap; sitemap indexes are not recursively expanded.`;
        } else result.coverage.sitemap = `Root sitemap returned HTTP ${response.status}. Links will be discovered from pages.`;
      } catch { result.coverage.sitemap = "Root sitemap could not be read; links will be discovered from pages."; }
    }
    state.stage = "crawl"; return;
  }
  const parser = robotsParser(new URL("/robots.txt", root).href, state.robots);
  let fetched = 0, considered = 0;
  while (state.queue.length && result.pages.length < PAGE_LIMIT && fetched < 2 && considered++ < 30) {
    const url = state.queue.shift();
    if (state.visited.includes(url)) continue;
    state.visited.push(url);
    if (parser.isAllowed(url, "AOCWebsiteInsights") === false) { state.skipped++; continue; }
    fetched++;
    try {
      const page = parsePage(await read(url, { root, signal, allowed: candidate => parser.isAllowed(candidate, "AOCWebsiteInsights") !== false }), root);
      if (!result.pages.some(item => item.url === page.url)) result.pages.push(page);
      for (const link of page.links) if (!state.visited.includes(link) && !state.queue.includes(link) && state.queue.length < PAGE_LIMIT * 2) state.queue.push(link);
    } catch (error) {
      if (signal?.aborted) throw error;
      result.pages.push({ url, status: null, title: "", description: "", links: [], findings: [finding("fetch-failed", url, "seo", "warning", "Page could not be checked",
        "The public request was blocked, timed out, or exceeded the audit limits. This is not proof of a broken page.", "Unverified pages need a manual check.", "Open the page and check availability and crawler access.")] });
    }
  }
  result.coverage.robotsSkipped = state.skipped;
  if (!state.queue.length || result.pages.length >= PAGE_LIMIT) { result.coverage.remainingDiscovered = state.queue.length; state.stage = "mobile"; }
}
