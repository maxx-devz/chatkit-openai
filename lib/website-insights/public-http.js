import { lookup } from "node:dns/promises";
import { request } from "node:https";
import ipaddr from "ipaddr.js";
import { InsightError, sameWebsite } from "./policy.js";

export function publicAddress(address) {
  try {
    let ip = ipaddr.parse(address);
    if (ip.kind() === "ipv6" && ip.isIPv4MappedAddress()) ip = ip.toIPv4Address();
    return ip.range() === "unicast";
  } catch { return false; }
}
export async function resolvePublicHost(host, resolver = lookup) {
  let timer;
  const records = await Promise.race([resolver(host, { all: true, verbatim: true }), new Promise((_, reject) => {
    timer = setTimeout(() => reject(new InsightError("dns_timeout", "Website DNS lookup timed out.")), 3000);
  })]).finally(() => clearTimeout(timer));
  if (!records.length || records.some(record => !publicAddress(record.address))) {
    throw new InsightError("unsafe_address", "The website does not resolve exclusively to public addresses.");
  }
  return records[0];
}
export async function publicGet(input, { root = input, signal, maxBytes = 1_000_000, timeout = 7000, allowed = () => true } = {}) {
  let url = new URL(input);
  const deadline = Date.now() + timeout;
  for (let redirects = 0; redirects <= 3; redirects++) {
    if (!sameWebsite(url.href, root)) throw new InsightError("outside_website", "The website redirected outside its approved domain.");
    if (!allowed(url.href)) throw new InsightError("robots_excluded", "This URL is excluded by the website's robots rules.");
    const address = await resolvePublicHost(url.hostname);
    if (Date.now() >= deadline) throw new InsightError("fetch_timeout", "The website took too long to respond.");
    signal?.throwIfAborted();
    const result = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => req.destroy(new InsightError("fetch_timeout", "The website took too long to respond.")), Math.max(1, deadline - Date.now()));
      const req = request(url, {
        method: "GET", agent: false, signal, family: address.family, autoSelectFamily: false,
        lookup: (_host, options, callback) => callback(null,
          options?.all ? [{ address: address.address, family: address.family }] : address.address,
          options?.all ? undefined : address.family),
        headers: { "User-Agent": "AOCWebsiteInsights/1.0 (+read-only website audit)", Accept: "text/html,application/xhtml+xml,text/plain,application/xml", "Accept-Encoding": "identity" },
      }, response => {
        if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
          response.destroy(); clearTimeout(timer);
          resolve({ status: response.statusCode, location: response.headers.location }); return;
        }
        let length = 0; const parts = [];
        response.on("data", part => {
          length += part.length;
          if (length > maxBytes) req.destroy(new InsightError("page_too_large", "This page exceeded the audit size limit."));
          else parts.push(part);
        });
        response.on("end", () => { clearTimeout(timer); resolve({ url: url.href, status: response.statusCode,
          headers: response.headers, text: Buffer.concat(parts).toString("utf8") }); });
        response.on("error", error => { clearTimeout(timer); reject(error); });
      });
      req.on("error", error => { clearTimeout(timer); reject(error); });
      req.end();
    });
    if (!result.location) return result;
    url = new URL(result.location, url);
  }
  throw new InsightError("redirect_limit", "The website redirected too many times.");
}
