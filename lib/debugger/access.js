import "server-only";
import { auth, isPortalAuthConfigured } from "@/lib/auth";
import { getSessionCookie } from "better-auth/cookies";
import { debuggerChannel, debuggerCookieBinding, debuggerEnabled, debuggerSessionScope, issueDebuggerToken } from "./security.js";

export { debuggerEnabled };
export async function debuggerAccess(requestHeaders, { reportUnavailable = false } = {}) {
  if (!debuggerEnabled() || !isPortalAuthConfigured()) return null;
  try {
    const session = await auth.api.getSession({ headers: requestHeaders, query: { disableCookieCache: true } });
    const cookie = getSessionCookie(requestHeaders);
    if (!session?.user?.id || !session.session?.id || !cookie) return null;
    // Any authenticated account can inspect its own browser. An optional
    // deployment allowlist may narrow access, but never expands data access.
    const allowlist = (process.env.DEBUGGER_DEVELOPERS || "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
    if (allowlist.length) {
      if (![session.user.id, session.user.email, session.user.username].some((v) => v && allowlist.includes(v.toLowerCase()))) return null;
    }
    const secret = process.env.BETTER_AUTH_SECRET;
    const scope = debuggerSessionScope(session.user.id, session.session.id, secret);
    const expiresAt = Math.min(new Date(session.session.expiresAt).getTime(), Date.now() + 60 * 60_000);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return null;
    return {
      channel: debuggerChannel(scope, secret),
      token: issueDebuggerToken(scope, debuggerCookieBinding(cookie, secret), secret, expiresAt),
      expiresAt,
      development: process.env.NODE_ENV === "development",
      captureBodies: process.env.NODE_ENV === "development" && process.env.DEBUGGER_CAPTURE_BODIES === "true",
      bodyPaths: (process.env.DEBUGGER_BODY_PATHS || "").split(",").map((s) => s.trim()).filter((s) => s.startsWith("/api/") && !/auth|chatkit|provider|password|connection|library|file/i.test(s)),
      maxRecords: Math.max(200, Math.min(5000, Number(process.env.DEBUGGER_MAX_RECORDS) || 2500)),
    };
  } catch (error) { if (reportUnavailable) throw error; return null; }
}
