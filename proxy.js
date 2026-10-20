import { NextResponse } from "next/server";
import { DEBUGGER_PORTAL_HEADER, debuggerPageRequest } from "./lib/debugger/routing.js";

export function proxy(request) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const isDevelopment = process.env.NODE_ENV === "development";
  // Client-side navigation keeps the initial document's CSP. Login and staff
  // pages must allow the same ChatKit frame as the client workspace.
  // Chromium checks the destination after a form POST redirect, so allow the
  // Hubstaff authorization host used by the OAuth start endpoint.
  const policy = `
    default-src 'self';
    script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDevelopment ? " 'unsafe-eval'" : ""};
    style-src 'self' 'unsafe-inline';
    img-src 'self' blob: data:;
    font-src 'self' data:;
    connect-src 'self';
    frame-src 'self' https://cdn.platform.openai.com;
    media-src 'self' blob: data:;
    worker-src 'self' blob:;
    object-src 'none';
    base-uri 'self';
    form-action 'self' https://account.hubstaff.com;
    frame-ancestors 'none';
    manifest-src 'self';
    ${isDevelopment ? "" : "upgrade-insecure-requests;"}
  `.replace(/\s{2,}/g, " ").trim();

  const requestHeaders = new Headers(request.headers);
  // Never trust a caller-supplied return path. Any page can open the same
  // authenticated inspector, without rendering that page's role-specific shell.
  requestHeaders.delete(DEBUGGER_PORTAL_HEADER);
  const debuggerPage = debuggerPageRequest(request.url, request.method);
  if (debuggerPage) requestHeaders.set(DEBUGGER_PORTAL_HEADER, debuggerPage.portalPath);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const options = { request: { headers: requestHeaders } };
  const response = debuggerPage?.rewrite
    ? NextResponse.rewrite(debuggerPage.destination, options)
    : NextResponse.next(options);
  if (debuggerPage) response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: [
    {
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
    {
      // A prefetched debugger URL must not cache the underlying portal page.
      source: "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|webp|svg|ico)$).*)",
      has: [{ type: "query", key: "debugger", value: "true" }],
    },
  ],
};
