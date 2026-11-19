import { NextResponse } from "next/server";
import { requestWorkspaceHeaders, trustedPortalHost } from "./lib/workspace-selection.js";
import { DEBUGGER_PORTAL_HEADER, debuggerPageRequest } from "./lib/debugger/routing.js";

export function proxy(request) {
  if (request.headers.get("x-forwarded-host") && request.headers.get("x-forwarded-host").toLowerCase() !== request.headers.get("host")?.toLowerCase()) return new NextResponse("Untrusted forwarded host.", {status:403});
  if (!trustedPortalHost(request.headers.get("host"))) return new NextResponse("Unknown portal host.", { status: 403 });
  // Reserve agency-mode routes until the Stage 11 rollout.
  if (/^\/(?:api\/)?agency(?:\/|$)/.test(request.nextUrl.pathname)) return new NextResponse(null, { status: 404 });
  let requestHeaders;
  try { requestHeaders = requestWorkspaceHeaders(new URL(request.url), request.headers); }
  catch { return new NextResponse("Invalid workspace selection.", { status: 400 }); }
  requestHeaders.delete(DEBUGGER_PORTAL_HEADER);
  for(const name of ["x-agency-brand","x-forwarded-host"])requestHeaders.delete(name);
  if (request.nextUrl.pathname.startsWith("/api/")) {
    const response = NextResponse.next({ request: { headers: requestHeaders } });
    response.headers.set("Cache-Control", "private, no-store");
  if (request.nextUrl.pathname.startsWith("/account/") || request.nextUrl.pathname.startsWith("/portal/")) response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
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

  // Never trust a caller-supplied return path. Any page can open the same
  // authenticated inspector, without rendering that page's role-specific shell.
  const debuggerPage = debuggerPageRequest(request.url, request.method);
  if (debuggerPage) requestHeaders.set(DEBUGGER_PORTAL_HEADER, debuggerPage.portalPath);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", policy);

  const options = { request: { headers: requestHeaders } };
  const response = debuggerPage?.rewrite
    ? NextResponse.rewrite(debuggerPage.destination, options)
    : NextResponse.next(options);
  response.headers.set("Cache-Control", "private, no-store");
  if (request.nextUrl.pathname.startsWith("/account/") || request.nextUrl.pathname.startsWith("/portal/")) response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("Content-Security-Policy", policy);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
