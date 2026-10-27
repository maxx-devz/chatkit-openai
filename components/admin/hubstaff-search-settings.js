"use client";
import { useCallback, useEffect, useState } from "react";
import styles from "./hubstaff-search-settings.module.css";

const LABELS = {not_started:"Not started",needs_sync:"Needs synchronization",building:"Indexing task history",
  indexing_comments:"Indexing discussions",ready:"Ready"};
export default function HubstaffSearchSettings() {
  const [clients,setClients] = useState([]);
  const [busy,setBusy] = useState("");
  const [error,setError] = useState("");
  const load = useCallback(async signal => {
    const response = await fetch("/api/admin/hubstaff-index",{cache:"no-store",signal});
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || "Status unavailable.");
    setClients(result.clients);
  },[]);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => load(controller.signal).catch(e => {if (!controller.signal.aborted) setError(e.message);});
    refresh();
    const timer = setInterval(refresh,30_000);
    return () => {controller.abort();clearInterval(timer);};
  },[load]);
  async function sync(id) {
    setBusy(id);setError("");
    try {
      const response = await fetch("/api/admin/hubstaff-index",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({clientId:id})});
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Synchronization unavailable.");
      await load();
    } catch (e) {setError(e.message);} finally {setBusy("");}
  }
  return <main className={styles.main}>
    <header><p className={styles.eyebrow}>AOC ADMIN · READ-ONLY HUBSTAFF SEARCH</p><h1>Project search index</h1>
      <p>Prepare available active and completed task history once, then search relevant records for Work questions.</p></header>
    <aside className={styles.notice}>A background worker or scheduled sync keeps this current. Each button runs one resumable batch—not the entire history.
      General chat does not use this index. Task activity is not a time log, and assignment does not identify who completed a task.</aside>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.grid}>{clients.map(client => <article key={client.id}>
      <div className={styles.heading}><h2>{client.name}</h2><span>{LABELS[client.phase] || client.phase}</span></div>
      <dl><div><dt>Tasks indexed</dt><dd>{client.taskCount.toLocaleString()}</dd></div>
        <div><dt>Comments indexed</dt><dd>{client.commentCount.toLocaleString()}</dd></div>
        <div><dt>Discussions pending</dt><dd>{client.pendingTasks.toLocaleString()}</dd></div></dl>
      <p>{client.metadataComplete ? "Available task inventory indexed." : "Initial task inventory is not yet complete; project-wide oldest results are withheld."}</p>
      <p>Inventory as of: {client.metadataCompletedAt ? new Date(client.metadataCompletedAt).toLocaleString() : "Not completed"}</p>
      <p>Access checked: {client.checkedAt ? new Date(client.checkedAt).toLocaleString() : "Not current"}</p>
      {client.unresolvedPeopleTasks > 0 && <p>Some assignee names are unresolved; person searches may be incomplete.</p>}
      <button disabled={Boolean(busy) || client.syncing} onClick={() => sync(client.id)}>
        {busy === client.id || client.syncing ? "Synchronizing…" : "Sync next batch"}</button>
    </article>)}</div>
    {!clients.length && !error && <p>No eligible assigned client projects found, or status is still loading.</p>}
  </main>;
}
