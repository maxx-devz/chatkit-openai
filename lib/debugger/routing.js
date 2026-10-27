// Browser-safe routing only. Authentication and the deployment kill switch stay
// in the shared debugger page; a query string never grants capture access.
export const DEBUGGER_PORTAL_HEADER = "x-aoc-debugger-portal-path";
const LOCAL_ORIGIN = "https://debugger.invalid";
const STATIC_FILE = /\.(?:avif|bmp|css|csv|gif|ico|jpe?g|js|json|map|mjs|mp3|mp4|otf|pdf|png|svg|ttf|txt|webm|webp|woff2?|xml|zip)$/i;

export function debuggerPortalPath(value) {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")
    || /[\\\u0000-\u0020\u007f]/.test(value)) return "/";
  try {
    const url = new URL(value, LOCAL_ORIGIN);
    if (url.origin !== LOCAL_ORIGIN) return "/";
    url.searchParams.delete("debugger");
    url.searchParams.delete("_rsc");
    const path = `${url.pathname}${url.search}`;
    return path.length <= 4096 ? path : url.pathname.length <= 4096 ? url.pathname : "/";
  } catch { return "/"; }
}

export function debuggerPageRequest(value, method = "GET") {
  if (!["GET", "HEAD"].includes(method)) return null;
  try {
    const url = new URL(value);
    const flags = url.searchParams.getAll("debugger");
    if (flags.length !== 1 || flags[0] !== "true") return null;
    // Page inspection must never replace an API response, asset, or mutation.
    if (/^\/(?:api|_next|\.well-known)(?:\/|$)/.test(url.pathname)
      || STATIC_FILE.test(url.pathname)) return null;
    return {
      rewrite: url.pathname !== "/",
      destination: new URL("/?debugger=true", url).href,
      portalPath: debuggerPortalPath(`${url.pathname}${url.search}`),
    };
  } catch { return null; }
}
