// No auth import: used by Better Auth hooks and the trusted session consumers.
export function accountSecurityEnabled() { return process.env.PORTAL_ACCOUNT_SECURITY_ENABLED === "true"; }
export async function accountStatus(db, actor, session) {
  const ready = (await db.query("SELECT to_regprocedure('agency_platform.account_status(text,text)') IS NOT NULL ready")).rows[0]?.ready;
  if (!ready) {
    if (accountSecurityEnabled()) throw Object.assign(Error("Account security setup is incomplete."), { status: 503 });
    return null;
  }
  return (await db.query("SELECT agency_platform.account_status($1,$2) data", [actor, session])).rows[0].data;
}
export async function assertAccountSession(db, actor, session) {
  const state = await accountStatus(db, actor, session);
  if (state && (!state.active || !state.emailVerified || (state.required && !state.assured))) throw Object.assign(Error("Complete account security at /account/security before continuing."), { status: 403, code: "account_security_required", publicDetails: { status: 403, code: "account_security_required", message: "Complete account security at /account/security before continuing." } });
}
