"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import s from "./login.module.css";
async function account(body) {
  const response = await fetch("/api/account/security", { method: body ? "POST" : "GET", cache: "no-store", headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const data = await response.json(); if (!response.ok) throw Error(data.error || "Request unavailable."); return data;
}
export default function AccountControls({ mode }) {
  const router = useRouter();
  const epoch = useRef(0);
  const [obscured, setObscured] = useState(true);
  const [state, setState] = useState(null), [link, setLink] = useState(null), [message, setMessage] = useState(""), [error, setError] = useState(""), [busy, setBusy] = useState(false), [enrollment, setEnrollment] = useState(null), [backup, setBackup] = useState(false);
  useEffect(() => {
    if (["reset", "verify", "invitation"].includes(mode)) {
      const consume = () => {
        const params = new URLSearchParams(window.location.hash.slice(1));
        if (!params.has("token")) return;
        const value = { token: params.get("token") || "", id: params.get("id") || "" };
        window.history.replaceState(null, "", window.location.pathname);
        // A reopened email can be a same-document hash navigation. Consume it
        // without placing the bearer in storage, history or network URLs.
        Promise.resolve().then(() => { setLink(value); setMessage(""); setError(""); });
      };
      consume(); window.addEventListener("hashchange", consume);
      return () => window.removeEventListener("hashchange", consume);
    }
    if (mode === "security") {
      let active = true, identity;
      const refresh = () => {
        const ticket = ++epoch.current;
        setObscured(true);
        account().then(value => {
          if (!active || ticket !== epoch.current) return;
          if (identity && identity !== value.accountKey) setEnrollment(null);
          identity = value.accountKey; setState(value); setObscured(false);
        }).catch(e => { if (active && ticket === epoch.current) { setState(null); setEnrollment(null); setError(e.message); } });
      };
      const conceal = () => { epoch.current += 1; setObscured(true); };
      const visible = () => document.hidden ? conceal() : refresh();
      const restored = event => { if (event.persisted) { conceal(); window.location.reload(); } };
      Promise.resolve().then(refresh);
      window.addEventListener("blur", conceal); window.addEventListener("focus", refresh);
      window.addEventListener("pageshow", restored); document.addEventListener("visibilitychange", visible);
      return () => { active = false; window.removeEventListener("blur", conceal); window.removeEventListener("focus", refresh); window.removeEventListener("pageshow", restored); document.removeEventListener("visibilitychange", visible); };
    }
  }, [mode]);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const ticket = epoch.current;
    const form = new FormData(event.currentTarget), fields = Object.fromEntries(form);
    try {
      if (mode === "recovery") { const result = await account({ action: fields.action, email: fields.email }); setMessage(result.message); }
      if (mode === "reset") { const result = await account({ action: "reset", token: link?.token, password: fields.password }); setLink(null); setMessage(result.message); }
      if (mode === "verify") { const result = await account({ action: "verify", token: link?.token }); setLink(null); setMessage(result.message); }
      if (mode === "invitation") {
        const response = await fetch("/api/admin/agency/invitations", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify(link) });
        const result = await response.json(); if (!response.ok) throw Error("Invitation unavailable. Sign in as the intended recipient and use an unexpired link."); setLink(null); setMessage("Invitation accepted. Only the offered workspace membership was added.");
      }
      if (mode === "mfa") {
        const result = backup ? await authClient.twoFactor.verifyBackupCode({ code: fields.code }) : await authClient.twoFactor.verifyTotp({ code: fields.code });
        if (result.error) throw Error("Second-factor verification failed."); router.replace("/account/security"); router.refresh();
      }
      if (mode === "security") {
        if (fields.action === "enroll") { const result = await authClient.twoFactor.enable({ password: fields.password }); if (result.error) throw Error("MFA setup could not be started. Check your password and current verification."); if (ticket === epoch.current) setEnrollment(result.data); }
        else if (fields.action === "factor") {
          const result = await authClient.twoFactor.verifyTotp({ code: fields.code }); if (result.error) throw Error("Authenticator code was not accepted."); setState(await account()); setMessage("Second factor verified for this session.");
        } else if (fields.action === "codes") {
          const result = await authClient.twoFactor.generateBackupCodes({ password: fields.password }); if (result.error) throw Error("Verify your second factor and password first."); if (ticket === epoch.current) setEnrollment({ backupCodes: result.data.backupCodes }); setMessage("Previous recovery codes were replaced.");
        } else { const result = await account({ action: fields.action }); setMessage(result.message); }
      }
      event.target.reset();
    } catch (e) { setError(e.message); } finally { setBusy(false); }
  }
  const field = (label, name, type = "text", props = {}) => <label><span>{label}</span><input name={name} type={type} required {...props} /></label>;
  const title = { security: "Account security", mfa: "Verify second factor", recovery: "Recover or verify your account", reset: "Choose a new password", verify: "Verify your email", invitation: "Accept workspace invitation" }[mode];
  return <main className={s.page}><section className={s.card} style={{ maxWidth: 720, overflowWrap: "anywhere" }}><h1>{title}</h1><p>Access to each workspace is checked independently. Account recovery does not grant new permissions.</p>{error && <p role="alert" className={s.error}>{error}</p>}{message && <p role="status">{message}</p>}
    {mode === "recovery" && <form className={s.form} onSubmit={submit}>{field("Account email", "email", "email")}<label>Request<select name="action"><option value="recovery">Password recovery</option><option value="verification">Email verification</option></select></label><button disabled={busy}>Request instructions</button><p>Local review messages are captured privately; no real email is sent.</p></form>}
    {["reset", "verify", "invitation"].includes(mode) && link?.token && <form className={s.form} onSubmit={submit}>{mode === "reset" && field("New password", "password", "password", { minLength: 12, maxLength: 128, autoComplete: "new-password" })}<button disabled={busy}>{mode === "reset" ? "Reset password" : mode === "verify" ? "Verify email" : "Accept invitation"}</button></form>}
    {mode === "mfa" && <form className={s.form} onSubmit={submit}>{field(backup ? "Recovery code" : "Authenticator code", "code", "text", { autoComplete: "one-time-code" })}<button disabled={busy}>Verify</button><button type="button" onClick={() => setBackup(!backup)}>{backup ? "Use authenticator" : "Use a recovery code"}</button></form>}
    {mode === "security" && state && !obscured && <><p>{state.email}</p><p>{state.required ? "MFA is required for your privileged roles." : "MFA is optional for this account."} {state.assured ? "This session has completed MFA." : "Complete MFA before privileged access."}</p>
      {!state.twoFactorEnabled && <form className={s.form} onSubmit={submit}><input type="hidden" name="action" value="enroll" />{field("Current password", "password", "password", { autoComplete: "current-password" })}<button disabled={busy || !state.emailVerified}>Set up authenticator</button></form>}
      {(state.twoFactorEnabled || enrollment?.totpURI) && <form className={s.form} onSubmit={submit}><input type="hidden" name="action" value="factor" />{field("Authenticator code", "code", "text", { autoComplete: "one-time-code", pattern: "[0-9]{6}" })}<button disabled={busy}>Verify authenticator</button></form>}
      {enrollment && <aside><h2>Save privately</h2>{enrollment.totpURI && <><p>Import this URI into your authenticator, then verify its code:</p><code>{enrollment.totpURI}</code></>}<p>Store recovery codes privately. Each code works once; never send them in chat.</p><pre>{enrollment.backupCodes?.join("\n")}</pre><button onClick={() => setEnrollment(null)}>Hide setup details</button></aside>}
      {state.twoFactorEnabled && <form className={s.form} onSubmit={submit}><input type="hidden" name="action" value="codes" />{field("Current password for new recovery codes", "password", "password")}<button disabled={busy || !state.assured}>Replace recovery codes</button></form>}
      <form className={s.form} onSubmit={submit}><input type="hidden" name="action" value="revoke-others" /><button disabled={busy}>Sign out other sessions</button></form><p>Lost your device? Sign in with an unused recovery code. Password reset preserves MFA. If all factors are lost, access stays blocked pending approved identity recovery.</p></>}
    <p><Link href="/login">Sign in</Link> · <Link href="/account/recovery">Recovery and verification</Link> · <Link href="/platform">Platform</Link> · <Link href="/admin/agency">Agency workspace</Link> · <Link href="/delivery">Specialist delivery</Link></p>
  </section></main>;
}
