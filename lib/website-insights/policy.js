import { normalizeApprovedWebsiteUrl } from "../client-website.js";

export const PAGE_LIMIT = 12;
export const CALLBACK = "/api/client/website-insights/google/callback";
export const SEARCH_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
export class InsightError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
export function resourceId(id) {
  if (typeof id !== "string" || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) {
    throw new InsightError("invalid_id", "Select a valid website or report.");
  }
  return id;
}
export function websiteInput(input) {
  const name = typeof input.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 120) throw new InsightError("invalid_name", "Enter a website name (up to 120 characters).");
  let url;
  try { url = normalizeApprovedWebsiteUrl(input.url); }
  catch { throw new InsightError("invalid_url", "Enter a public HTTPS website address, without a password or custom port."); }
  if (!url) throw new InsightError("invalid_url", "Enter the website URL.");
  return { name, url };
}
export function sameWebsite(candidate, root) {
  try {
    const url = new URL(candidate), base = new URL(root);
    const host = value => value.replace(/^www\./, "");
    return url.protocol === "https:" && !url.username && !url.password && (!url.port || url.port === "443")
      && host(url.hostname) === host(base.hostname);
  } catch { return false; }
}
export function crawlUrl(candidate, root) {
  try {
    const url = new URL(candidate, root);
    if (!sameWebsite(url.href, root) || url.search || /\.(?:pdf|zip|png|jpe?g|gif|webp|svg|xml|json|mp4|css|js)$/i.test(url.pathname)
      || /\/(?:admin|account|login|logout|signout|cart|checkout|search|wp-admin|api)(?:\/|$)/i.test(url.pathname)) return null;
    url.hash = "";
    return url.href;
  } catch { return null; }
}
export function propertyCoversWebsite(property, website) {
  if (typeof property !== "string" || property.length > 1000) return false;
  const url = new URL(website);
  if (property.startsWith("sc-domain:")) {
    const host = property.slice(10).toLowerCase();
    return /^[a-z0-9.-]+\.[a-z]+$/i.test(host) && (url.hostname === host || url.hostname.endsWith("." + host));
  }
  try { const prefix = new URL(property); return prefix.origin === url.origin && url.pathname.startsWith(prefix.pathname); }
  catch { return false; }
}
export function googleConfig(env = process.env) {
  const clientId = env.WEBSITE_INSIGHTS_GOOGLE_CLIENT_ID || env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = env.WEBSITE_INSIGHTS_GOOGLE_CLIENT_SECRET || env.GOOGLE_DRIVE_CLIENT_SECRET;
  const secret = env.WEBSITE_INSIGHTS_ENCRYPTION_KEY || env.GOOGLE_DRIVE_TOKEN_ENCRYPTION_KEY;
  let origin;
  try {
    const url = new URL(env.BETTER_AUTH_URL);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash
      || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error();
    origin = url.origin;
  } catch { throw new InsightError("google_setup", "Search Console connection needs the portal's server URL configured.", 503); }
  if (!clientId || !clientSecret || !secret || secret.length < 32) {
    throw new InsightError("google_setup", "Search Console connection is not configured yet. Website analysis still works without Google. Ask your portal operator to follow docs/WEBSITE_INSIGHTS.md.", 503);
  }
  return { clientId, clientSecret, secret, origin, redirectUri: origin + CALLBACK };
}
