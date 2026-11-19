import { auth } from "@/lib/auth";
import { databasePool } from "@/lib/database";
import { accountSecurityEnabled, accountStatus } from "@/lib/account-security-policy";
import { trustedPortalHost } from "@/lib/workspace-selection";
import { assertTrustedOrigin, readJsonRequest } from "@/lib/request-security";

export const dynamic = "force-dynamic";
const privateHeaders = { "Cache-Control": "private, no-store", Vary: "Cookie", "Referrer-Policy": "no-referrer" };
function reply(data, status = 200) { return Response.json(data, { status, headers: privateHeaders }); }
async function own(headers) {
  if (!accountSecurityEnabled() || !trustedPortalHost(headers.get("host"))) throw Error("setup");
  const session = await auth.api.getSession({ headers, query: { disableCookieCache: true } });
  if (!session?.user?.id || !session.session?.id) throw Error("session");
  const state = await accountStatus(databasePool, session.user.id, session.session.id);
  if (!state?.active) throw Error("unavailable");
  return { session, state };
}
export async function GET(request) {
  try {
    const { session, state } = await own(request.headers);
    // Provider session tokens never appear in this response.
    return reply({ ...state, accountKey: session.user.id, email: session.user.email, enabled: true });
  } catch { return reply({ error: "Sign in to the configured account-security environment." }, 401); }
}
export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    if (!accountSecurityEnabled() || !trustedPortalHost(request.headers.get("host"))) return reply({ error: "Account security setup is required." }, 503);
    const body = await readJsonRequest(request, 4000), action = body.action;
    const fields = { recovery: ["email"], verification: ["email"], reset: ["token", "password"], verify: ["token"], "revoke-others": [] };
    if (!Object.hasOwn(fields, action) || Object.keys(body).some(k => !["action", ...fields[action]].includes(k))) return reply({ error: "Check the submitted fields." }, 400);
    if (["recovery", "verification"].includes(action)) {
      if (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) return reply({ error: "Enter a valid email address." }, 400);
      const started = Date.now();
      const path = action === "recovery" ? "request-password-reset" : "send-verification-email";
      // Use the HTTP dispatcher so provider database-backed rate limits and
      // origin/CSRF checks also cover these public wrapper endpoints.
      const result = await auth.handler(new Request(new URL("/api/auth/" + path, process.env.BETTER_AUTH_URL), { method: "POST", headers: request.headers, body: JSON.stringify({ email: body.email, redirectTo: new URL("/account/reset", process.env.BETTER_AUTH_URL).href, callbackURL: new URL("/account/verify", process.env.BETTER_AUTH_URL).href }) }));
      await new Promise(resolve => setTimeout(resolve, Math.max(0, 750 - (Date.now() - started))));
      if (result.status === 429) return reply({ error: "Please wait before requesting another message." }, 429);
      // Same message/status for known and unknown accounts, including capture
      // refusal. Live delivery is not configured or claimed in this stage.
      return reply({ message: "If eligible, instructions are available through the configured email service." });
    }
    if (action === "reset") {
      if (typeof body.token !== "string" || body.token.length > 512 || typeof body.password !== "string" || body.password.length < 12 || body.password.length > 128) return reply({ error: "Use a valid link and a password of 12–128 characters." }, 400);
      const result = await auth.handler(new Request(new URL("/api/auth/reset-password", process.env.BETTER_AUTH_URL), { method: "POST", headers: request.headers, body: JSON.stringify({ token: body.token, newPassword: body.password }) }));
      return result.ok ? reply({ message: "Password updated. Sign in again; MFA and workspace permissions are unchanged." }) : reply({ error: "The reset link is unavailable or expired." }, result.status === 429 ? 429 : 400);
    }
    if (action === "verify") {
      if (typeof body.token !== "string" || body.token.length > 3000) return reply({ error: "The verification link is unavailable." }, 400);
      const result = await auth.api.verifyEmail({ query: { token: body.token }, headers: request.headers, asResponse: true });
      return result.ok ? reply({ message: "Email verified. Sign in to continue." }) : reply({ error: "The verification link is unavailable or expired." }, 400);
    }
    await own(request.headers);
    await auth.api.revokeOtherSessions({ headers: request.headers });
    return reply({ message: "Other account sessions have been signed out. Workspace memberships were preserved." });
  } catch { return reply({ error: "This account-security request could not be completed." }, 403); }
}
