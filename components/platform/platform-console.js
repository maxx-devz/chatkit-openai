"use client";
import { useEffect, useRef, useState } from "react";
import ConsoleShell from "./console-shell";
import AccessDenied from "./access-denied";
import SupportRequests from "./support-requests";
import s from "./console.module.css";

export async function requestJson(url, body, method = "POST") {
  const response = await fetch(url, { method: body ? method : "GET", cache: "no-store", ...(body ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error || "The request could not be completed."), { status: response.status });
  return data;
}
function LifecycleDialog({ agency, onClose, onSave }) {
  const dialog = useRef(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  useEffect(() => { dialog.current?.showModal(); }, []);
  const action = agency.active ? "Suspend" : "Reactivate";
  async function save(event) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try { await onSave({ action: agency.active ? "suspend" : "reactivate", agencyId: agency.id, version: agency.version, reason: form.get("reason"), confirmation: form.get("confirmation"), operation: crypto.randomUUID() }); onClose(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  return <dialog ref={dialog} className={s.dialog} onCancel={event => { if (busy) event.preventDefault(); else onClose(); }} onClose={onClose} aria-labelledby="lifecycle-title">
    <h2 id="lifecycle-title">{action} {agency.name}</h2>
    <p>{agency.active ? "Agency access stops at the next authorization check. Active jobs and support grants are cancelled; connection versions are invalidated. Data and account assignments are retained." : "Active assignments can access the agency again. Revoked support grants and cancelled job leases do not return; new work must pass fresh checks."}</p>
    <p className={s.muted}>Billing is unchanged. This action does not cancel a subscription, issue a refund or erase customer data.</p>
    <form onSubmit={save}>
      <label className={s.field}>Reason<textarea name="reason" required minLength={3} maxLength={200} rows={3} /></label>
      <label className={s.field}>Type {agency.slug} to confirm<input name="confirmation" required autoComplete="off" pattern={agency.slug} /></label>
      {error && <p role="alert" className={s.alert}>{error}</p>}
      <div className={s.actions}><button className={`${s.button} ${agency.active ? s.danger : ""}`} disabled={busy}>{busy ? "Saving…" : `${action} agency`}</button><button type="button" className={`${s.button} ${s.secondary}`} disabled={busy} onClick={onClose}>Cancel</button></div>
    </form>
  </dialog>;
}
export default function PlatformConsole({ initialData }) {
  const [data, setData] = useState(initialData), [error, setError] = useState(""), [notice, setNotice] = useState(""), [busy, setBusy] = useState(false);
  const [q, setQ] = useState(""), [status, setStatus] = useState("all"), [selected, setSelected] = useState(null), [denied, setDenied] = useState(false);
  const filters = useRef({ q: "", status: "all", page: 0 });
  async function refresh(options = filters.current) {
    filters.current = options;
    try { const next = await requestJson("/api/platform/agencies?" + new URLSearchParams(options)); setData(next); return next; }
    catch (error) { if ([401, 403].includes(error.status)) { setDenied(true); setData(null); } throw error; }
  }
  useEffect(() => {
    const check = () => { refresh(filters.current).catch(error => setError(error.message)); };
    const restored = event => { if (event.persisted) check(); };
    window.addEventListener("focus", check); window.addEventListener("pageshow", restored);
    return () => { window.removeEventListener("focus", check); window.removeEventListener("pageshow", restored); };
  }, []);
  async function change(command) {
    try { await requestJson("/api/platform/agencies", command); await refresh(); setNotice(command.action === "create" ? "Agency created. No client access, connections or knowledge were inherited." : "Agency status updated and audited."); }
    catch (error) { if ([401, 403].includes(error.status)) { setDenied(true); setData(null); } throw error; }
  }
  async function create(event) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const form = event.currentTarget, fields = Object.fromEntries(new FormData(form));
    try { await change({ ...fields, action: "create", operation: crypto.randomUUID() }); form.reset(); }
    catch (error) { setError(error.message); }
    finally { setBusy(false); }
  }
  async function search(event) {
    event.preventDefault(); setBusy(true); setError("");
    try { await refresh({ q, status, page: 0 }); } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  if (denied || !data) return <AccessDenied />;
  return <ConsoleShell admin={data.admin} title="Agency workspaces" description="Platform oversight, separate from agency delivery and private client content.">
    <div className={s.stack}>
      <p className={s.notice}>Local development console · External agency access remains gated. Creating an agency does not enable external sign-in, inherit AOC connections or grant access to client content.</p>
      <div className={s.stats}><div className={s.stat}>Active agencies<strong>{data.activeCount}</strong><span className={s.muted}>Workspace lifecycle only</span></div><div className={s.stat}>Matching agencies<strong>{data.total}</strong><span className={s.muted}>Filtered directory</span></div><div className={s.stat}>Your platform access<strong>{data.canManage ? "Owner" : "Operator"}</strong><span className={s.muted}>{data.canManage ? "Provisioning and lifecycle controls" : "Metadata and support requests only"}</span></div></div>
      {error && <p role="alert" className={s.alert}>{error}</p>}{notice && <p role="status" className={s.success}>{notice}</p>}
      <section className={s.card}><h2>Agency directory</h2><form onSubmit={search} className={s.form}>
        <label>Search agencies<input value={q} maxLength={100} onChange={e => setQ(e.target.value)} placeholder="Name or slug" /></label>
        <label>Lifecycle status<select value={status} onChange={e => setStatus(e.target.value)}><option value="all">All statuses</option><option value="active">Active</option><option value="suspended">Suspended</option></select></label><button disabled={busy}>Search</button>
      </form><div className={s.tableWrap}><table className={s.table}><thead><tr><th>Agency</th><th>Lifecycle</th><th>Assigned owner</th><th>Operations</th><th>Recorded AI costs</th><th>Subscription</th><th>Controls</th></tr></thead><tbody>
        {data.agencies.map(a => <tr key={a.id}><td><strong>{a.name}</strong><small>{a.slug}{a.isAoc ? " · AOC delivery workspace" : ""}</small></td>
          <td><span className={`${s.badge} ${a.active ? "" : s.paused}`}>{a.active ? "Active" : "Suspended"}</span></td>
          <td>{a.owner ? <><strong>{a.owner.name}</strong><small>{a.owner.account}</small></> : "Unassigned"}</td>
          <td>{a.clientCount} clients<small>{a.failedJobs} recorded failed jobs</small><small>{a.disconnectedConnections ?? 0} disconnected bindings</small></td>
          <td>{a.costs ? <>{a.costs.usd == null ? "Unknown" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 4 }).format(Number(a.costs.usd))}<small>{a.costs.period} UTC · {a.costs.unknown} unknown-cost events</small></> : "No recorded events"}</td>
          <td>{a.subscription}</td><td>{data.canManage ? <button type="button" className={`${s.button} ${s.secondary}`} onClick={() => setSelected(a)} aria-label={`${a.active ? "Suspend" : "Reactivate"} ${a.name}`}>{a.active ? "Suspend" : "Reactivate"}</button> : "Read only"}</td></tr>)}
        {!data.agencies.length && <tr><td colSpan={7}>No agencies match these filters.</td></tr>}
      </tbody></table></div><div className={s.actions} style={{ marginTop: 16 }}><button className={`${s.button} ${s.secondary}`} disabled={busy || data.page === 0} onClick={() => refresh({ ...filters.current, page: data.page - 1 }).catch(e => setError(e.message))}>Previous</button><span>Page {data.page + 1}</span><button className={`${s.button} ${s.secondary}`} disabled={busy || (data.page + 1) * data.pageSize >= data.total} onClick={() => refresh({ ...filters.current, page: data.page + 1 }).catch(e => setError(e.message))}>Next</button></div>
        <p className={s.muted}>Costs are recorded provider usage for the current UTC month, including retained history. They are not invoices, staffing prices, AOC fees or subscription charges. Disconnected bindings and failed jobs are local recorded signals, not a live provider health check.</p>
      </section>
      {data.canManage && <section className={s.card}><h2>Create an agency</h2><p className={s.muted}>Assign an existing approved account for ownership accountability. This does not grant platform, client or delivery permissions. Account onboarding follows separately.</p><form onSubmit={create} className={s.form}>
        <label>Agency name<input name="name" required maxLength={160} /></label><label>Agency slug<input name="slug" required pattern="[a-z0-9][a-z0-9_-]{1,79}" maxLength={80} /></label><label>Owner account identifier<input name="ownerAccount" required maxLength={200} autoComplete="off" /></label><label>Creation reason<input name="reason" required minLength={3} maxLength={200} /></label><button disabled={busy}>{busy ? "Saving…" : "Create agency"}</button>
      </form></section>}
      <section className={s.card}><h2>Controlled support access</h2><p>Support can request a 30-minute, client-specific status check. Two distinct approvers must consent: an agency administrator and a client administrator. The requester cannot approve their own access.</p><p className={s.muted}>The approved action returns only whether the client portal is enabled. It does not open chats, documents or an impersonated session. External agency support remains unavailable while its gate is closed.</p><SupportRequests targets={data.targets} platform initialRequests={data.requests} /></section>
      <section className={s.card}><h2>Platform audit</h2><div className={s.tableWrap}><table className={s.table}><thead><tr><th>Time</th><th>Action</th><th>Agency</th><th>Actor</th><th>Reason</th></tr></thead><tbody>{data.audit.map(a => <tr key={a.id}><td>{new Date(a.occurredAt).toLocaleString()}</td><td>{a.action}</td><td>{a.agency || "Platform"}</td><td>{a.actor || "Database operator"}</td><td>{a.reason}</td></tr>)}{!data.audit.length && <tr><td colSpan={5}>No recorded actions.</td></tr>}</tbody></table></div></section>
    </div>{selected && <LifecycleDialog agency={selected} onClose={() => setSelected(null)} onSave={change} />}
  </ConsoleShell>;
}
