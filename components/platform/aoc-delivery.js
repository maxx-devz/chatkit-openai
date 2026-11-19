"use client";
import { useState } from "react";
import Link from "next/link";
import ConsoleShell from "./console-shell";
import s from "./console.module.css";
export default function AocDelivery({ initialData }) {
  const [data, setData] = useState(initialData), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function update(event, client) {
    event.preventDefault(); setBusy(true); setError("");
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/admin/aoc-clients", { method: "PATCH", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: client.id, portalEnabled: form.get("portal") === "on", aiEnabled: form.get("ai") === "on" }) });
      const result = await response.json(); if (!response.ok) { if ([401, 403].includes(response.status)) setData({ clients: [] }); throw Error(result.error); } setData(result);
    } catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <ConsoleShell delivery admin={{ name: "AOC delivery", role: "AOC agency administrator" }} active="delivery" title="AOC client delivery" description="AOC-scoped client access controls; separate from platform ownership."><div className={s.stack}>
    <p className={s.notice}>Requires both an active legacy AOC Admin account and an explicit AOC agency administrator assignment. Platform ownership alone grants no delivery access. The global legacy Admin screens retain their AOC-only-estate restriction.</p>
    <section className={s.card}><h2>AOC clients</h2>{error && <p role="alert" className={s.alert}>{error}</p>}{data.clients.map(c => <form className={s.form} onSubmit={event => update(event, c)} key={c.id}><strong>{c.name}</strong><span className={s.muted}>{c.slug}</span><label><span>Portal enabled</span><input type="checkbox" name="portal" defaultChecked={c.portalEnabled} /></label><label><span>AI enabled</span><input type="checkbox" name="ai" defaultChecked={c.aiEnabled} /></label><button disabled={busy} aria-label={`Save ${c.name} access`}>Save access</button></form>)}<p className={s.muted}>Saved changes are audited. Client identifiers and assignments remain unchanged.</p><p><Link href="/admin">Legacy AOC administration</Link> · <Link href="/support/requests">Support approvals</Link></p></section>
  </div></ConsoleShell>;
}
