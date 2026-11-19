"use client";
import { useEffect, useState } from "react";
import s from "./console.module.css";
// Kept independent of the console shell; approval never confers platform access.
async function send(body) {
  const response = await fetch("/api/support/requests", { method: body ? "POST" : "GET", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json(); if (!response.ok) throw new Error(data.error || "Support access denied."); return data;
}
export default function SupportRequests({ targets = [], platform = false, initialRequests = [] }) {
  const [requests, setRequests] = useState(initialRequests), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  async function refresh() { try { setRequests((await send()).requests); } catch (error) { setRequests([]); throw error; } }
  useEffect(() => { const check = () => refresh().catch(e => setError(e.message)); window.addEventListener("focus", check); return () => window.removeEventListener("focus", check); }, []);
  async function act(body) {
    setBusy(true); setError(""); setNotice("");
    try { const result = await send(body); if (result.status) setNotice(`Approved status: portal ${result.status.portalEnabled ? "enabled" : "disabled"}. No private client content was accessed.`); else setNotice("Support action recorded."); await refresh(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function create(event) {
    event.preventDefault(); const fields = Object.fromEntries(new FormData(event.currentTarget));
    await act({ ...fields, action: "request", operation: crypto.randomUUID() });
  }
  return <div>{platform && <form className={s.form} onSubmit={create}><label>Support client<select name="clientId" required><option value="">Select an AOC client</option>{targets.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Support reason<input name="reason" required minLength={3} maxLength={200} /></label><label>Support ticket<input name="ticket" required maxLength={100} /></label><button disabled={busy || !targets.length}>Request status access</button></form>}
    <div className={s.actions}><button className={`${s.button} ${s.secondary}`} disabled={busy} onClick={() => refresh().catch(e => setError(e.message))}>Refresh support requests</button></div>
    {error && <p role="alert" className={s.alert}>{error}</p>}{notice && <p role="status" className={s.success}>{notice}</p>}
    {!requests.length && <p className={s.muted}>No support requests are available to this account.</p>}
    {requests.map(r => <article key={r.id} className={s.request}><h3>{r.agency} / {r.client}</h3><p>{r.requester} · {r.ticket} · {r.reason}</p><p className={s.muted}>{r.status} · Expires {new Date(r.expiresAt).toLocaleString()} · Agency consent: {r.agencyApproved ? "recorded" : "pending"} · Client consent: {r.clientApproved ? "recorded" : "pending"}{r.lastUsedAt ? ` · Last status check: ${new Date(r.lastUsedAt).toLocaleString()}` : ""}</p>
      <div className={s.actions}>{[["agency", r.canApproveAgency], ["client", r.canApproveClient]].filter(([, allowed]) => allowed).map(([capacity]) => <span key={capacity} className={s.actions}><button className={s.button} disabled={busy} onClick={() => { if (window.confirm(`Approve ${capacity} consent for a status-only check until expiry?`)) act({ action: "approve", id: r.id, capacity }); }}>Approve as {capacity} administrator</button><button className={`${s.button} ${s.secondary}`} disabled={busy} onClick={() => act({ action: "deny", id: r.id, capacity })}>Deny as {capacity} administrator</button></span>)}
      {platform && r.isRequester && r.status === "approved" && <button className={s.button} disabled={busy} onClick={() => act({ action: "check", id: r.id })}>Check approved portal status</button>}</div>
      <div className={s.actions}>{[["agency", r.canRevokeAgency], ["client", r.canRevokeClient]].filter(([, allowed]) => allowed).map(([capacity]) => <button key={capacity} className={`${s.button} ${s.secondary}`} disabled={busy} onClick={() => act({ action: "revoke", id: r.id, capacity })}>Revoke as {capacity} administrator</button>)}</div>
    </article>)}
  </div>;
}
