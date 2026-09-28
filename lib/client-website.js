import { isIP } from "node:net";

const FORBIDDEN_SUFFIXES = [".local", ".internal", ".localhost", ".home", ".lan"];

export function normalizeApprovedWebsiteUrl(value) {
  const input = typeof value === "string" ? value.trim() : "";
  if (!input) return "";
  let url;
  try { url = new URL(input); }
  catch { throw new Error("Use a complete HTTPS website URL, such as https://example.com."); }
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (
    url.protocol !== "https:"
    || url.username
    || url.password
    || (url.port && url.port !== "443")
    || !host.includes(".")
    || isIP(host)
    || host === "localhost"
    || FORBIDDEN_SUFFIXES.some((suffix) => host.endsWith(suffix))
    || host.length > 253
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(host)
  ) {
    throw new Error("The approved website must be a public HTTPS domain without credentials or a custom port.");
  }
  return `https://${host}/`;
}

export function approvedWebsiteDomain(value) {
  const normalized = normalizeApprovedWebsiteUrl(value);
  return normalized ? new URL(normalized).hostname : "";
}
