import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { accountStatus } from "./account-security-policy.js";

export function accountSecurityHooks(db) {
  return {
    before: createAuthMiddleware(async ctx => {
      if (!ctx.path.startsWith("/two-factor/")) return;
      if (ctx.body?.trustDevice || ctx.body?.method === "otp" || /otp$/.test(ctx.path) && !ctx.path.endsWith("totp")) throw new APIError("FORBIDDEN", { message: "Use an authenticator or recovery code." });
      const session = await getSessionFromCtx(ctx);
      if (!session) return; // The provider validates the signed MFA challenge.
      const state = await accountStatus(db, session.user.id, session.session.id);
      if (!state?.active || !session.user.emailVerified) throw new APIError("FORBIDDEN", { message: "Verify your account before configuring MFA." });
      if (ctx.path === "/two-factor/disable" && state.required) throw new APIError("FORBIDDEN", { message: "MFA is required for this account's privileged roles." });
      // A password alone must not replace an enrolled factor or recovery codes.
      if (session.user.twoFactorEnabled && !["/two-factor/verify-totp", "/two-factor/verify-backup-code"].includes(ctx.path) && !state.assured) throw new APIError("FORBIDDEN", { message: "Verify your current second factor first." });
    }),
    after: createAuthMiddleware(async ctx => {
      if (!["/two-factor/verify-totp", "/two-factor/verify-backup-code"].includes(ctx.path)) return;
      const result = ctx.context.returned;
      if (!result || result instanceof Error || !result.token) return;
      // These provider endpoints return a token only after factor verification.
      // Enrollment may rotate the session, so prefer its new authoritative row.
      const token = ctx.context.newSession?.session?.token || result.token;
      await db.query("SELECT agency_platform.record_session_factor($1,$2)", [token, ctx.path.endsWith("totp") ? "totp" : "backup"]);
    }),
  };
}
