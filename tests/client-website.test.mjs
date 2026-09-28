import test from "node:test";
import assert from "node:assert/strict";

import { approvedWebsiteDomain, normalizeApprovedWebsiteUrl } from "../lib/client-website.js";

test("approved client websites normalize to one public HTTPS origin", () => {
  assert.equal(normalizeApprovedWebsiteUrl(" https://WWW.Example.com/services?q=1#top "), "https://www.example.com/");
  assert.equal(approvedWebsiteDomain("https://shop.example.com/"), "shop.example.com");
  assert.equal(normalizeApprovedWebsiteUrl(""), "");
});

test("approved client websites reject unsafe and ambiguous destinations", () => {
  for (const value of [
    "http://example.com", "https://user:pass@example.com", "https://localhost",
    "https://127.0.0.1", "https://portal.internal", "https://example.com:8443",
    "javascript:alert(1)", "not a URL",
  ]) assert.throws(() => normalizeApprovedWebsiteUrl(value));
});
