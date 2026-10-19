import { createHmac, timingSafeEqual } from "node:crypto";

export function debuggerEnabled(env = process.env) {
  return env.DEBUGGER === "true";
}
export function debuggerLabEnabled(env = process.env) { return debuggerEnabled(env) && env.NODE_ENV === "development"; }
function digest(text, secret) { return createHmac("sha256", secret).update(text).digest("base64url"); }
export function debuggerSessionScope(userId, sessionId, secret) { return digest(`scope:${JSON.stringify([userId, sessionId])}`, secret); }
export function debuggerCookieBinding(cookie, secret) { return cookie ? digest(`cookie:${cookie}`, secret) : null; }
export function issueDebuggerToken(scope, binding, secret, expiresAt, now = Date.now()) {
  const payload = Buffer.from(JSON.stringify({ s: scope, b: binding, e: Math.min(expiresAt, now + 60 * 60_000) })).toString("base64url");
  return `${payload}.${digest(`aoc-debugger:${payload}`, secret)}`;
}
export function verifyDebuggerToken(token, binding, secret, now = Date.now()) {
  if (!secret || typeof token !== "string" || token.length > 1500) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !/^[a-zA-Z0-9_-]{43}$/.test(signature || "") || extra) return null;
  const expected = digest(`aoc-debugger:${payload}`, secret);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString());
    return /^[\w-]{43}$/.test(data.s || "") && binding && data.b === binding && Number.isFinite(data.e) && data.e > now && data.e <= now + 60 * 60_000 ? data : null;
  } catch { return null; }
}
export function debuggerChannel(scope, secret) { return `aoc-debugger:${digest(`channel:${scope}`, secret)}`; }
