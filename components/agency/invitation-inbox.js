"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import s from "@/components/platform/console.module.css";
export default function InvitationInbox({ initialInvitations }) {
  const router = useRouter();
  const [invitations, setInvitations] = useState(initialInvitations), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  async function accept(invitation) {
    setBusy(true); setError("");
    try { const response = await fetch("/api/admin/agency/invitations", { method: "POST", cache: "no-store", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: invitation.id }) }); const result = await response.json(); if (!response.ok) throw Error(result.error); setInvitations(list => list.filter(i => i.id !== invitation.id)); if (invitation.role !== "client_user") router.push("/admin/agency?" + new URLSearchParams({ agency: invitation.agencySlug })); }
    catch (error) { setError(error.message); } finally { setBusy(false); }
  }
  return <main className={s.card} style={{ maxWidth: 800, margin: "40px auto" }}><h1>Your agency invitations</h1><p>Accepting joins only the named agency and offered role. It does not grant platform control or access to unrelated clients.</p>{error && <p role="alert" className={s.alert}>{error}</p>}{invitations.map(i => <article className={s.request} key={i.id}><h2>{i.agency}</h2><p>{i.role}{i.clientRole ? " / " + i.clientRole : ""} · Expires {new Date(i.expiresAt).toLocaleString()}</p><button className={s.button} disabled={busy} onClick={() => accept(i)}>Accept {i.agency} invitation</button></article>)}{!invitations.length && <p>No active invitations are available to your account.</p>}<Link href="/admin/agency">Agency administration</Link></main>;
}
