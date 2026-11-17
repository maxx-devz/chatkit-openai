"use client";
import { useEffect, useRef, useState } from "react";
import { createHubstaffIndexMonitor } from "@/lib/hubstaff-index-monitor";
import styles from "./hubstaff-search-settings.module.css";

const LABELS = {not_started:"Not started",needs_sync:"Needs synchronization",building:"Indexing task history",
  indexing_comments:"Indexing discussions",ready:"Ready"};
export default function HubstaffSearchSettings() {
  const [clients,setClients] = useState([]);
  const [busy,setBusy] = useState("");
  const [errors,setErrors] = useState({});
  const error = Object.values(errors).join(" ");
  const [automatic,setAutomatic] = useState(true);
  const [checked,setChecked] = useState(null);
  const [batches,setBatches] = useState({});
  const monitor = useRef(null);
  useEffect(() => {
    const instance = createHubstaffIndexMonitor({onClients:setClients,onBusy:setBusy,
      onAutomatic:setAutomatic,
      onError:(message,id) => setErrors(previous => ({...previous,[id || "status"]:message})),
      onChecked:value => {
        setChecked(value);
        setErrors(previous => {if (!previous.status) return previous;const next={...previous};delete next.status;return next;});
      },
      onBatch:(id,batch) => {
        setBatches(previous => ({...previous,[id]:{...batch,count:(previous[id]?.count || 0)+1}}));
        setErrors(previous => {if (!previous[id]) return previous;const next={...previous};delete next[id];return next;});
      },
    });
    monitor.current = instance;
    instance.start();
    return () => {instance.stop();monitor.current=null;};
  },[]);
  function toggle() {
    if (monitor.current?.setAutomatic(!automatic) !== false) setErrors({});
  }
  return <main className={styles.main}>
    <header><p className={styles.eyebrow}>AOC ADMIN · READ-ONLY HUBSTAFF SEARCH</p><h1>Project search index</h1>
      <p>Automatically prepare available active and completed task history, then search relevant records for Work questions.</p></header>
    <aside className={styles.notice}>
      <div className={styles.controls}><strong>{automatic ? "Automatic batching is on" : "Automatic batching is paused"}</strong>
        <button type="button" onClick={toggle}>{automatic ? "Pause automatic sync" : "Resume automatic sync"}</button></div>
      <p>No repeated clicks: while this page stays open, one project batch runs at a time and saved totals refresh every 5 seconds.
        Pausing lets the current batch finish. Closing the page stops its automatic runner; the saved cursor is retained.</p>
      <p>For syncing with this page closed, run the background worker or configure the protected production scheduler.
        General chat does not use this index. Task activity is not a time log or proof of who completed a task.</p>
      <small>{checked ? `Last status refresh: ${new Date(checked).toLocaleTimeString()}` : "Loading saved progress…"}</small>
    </aside>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.grid}>{clients.map(client => {
      const batch = batches[client.id];
      const active = busy === client.id || client.syncing;
      const number = value => Number.isFinite(Number(value)) ? Number(value).toLocaleString() : "—";
      return <article key={client.id} aria-busy={active}>
      <div className={styles.heading}><h2>{client.name}</h2><span>{active ? "Pulling and saving a batch…" : LABELS[client.phase] || client.phase}</span></div>
      <dl><div><dt>Tasks saved in index</dt><dd>{number(client.savedTaskCount ?? client.taskCount)}</dd></div>
        <div><dt>Comments saved in index</dt><dd>{number(client.savedCommentCount ?? client.commentCount)}</dd></div>
        <div><dt>Discussions pending</dt><dd>{number(client.savedPendingTasks ?? client.pendingTasks)}</dd></div></dl>
      <div className={styles.batch} role="status" aria-live="polite" aria-atomic="true">
        {batch ? <><strong>Last completed batch: {number(batch.tasks)} tasks · {number(batch.comments)} comments processed and saved</strong>
          <small>{batch.count} batches completed in this view · {new Date(batch.completedAt).toLocaleTimeString()}</small></>
          : <span>{active ? "Pulling the next saved page. Committed totals update automatically." : "Waiting for the next batch or background worker update."}</span>}
      </div>
      <small>Saved totals are unique records. A batch can update existing records, so processed counts are not necessarily new records.</small>
      <p>{client.savedMetadataComplete ? "Available task inventory indexed." : "Initial task inventory is not yet complete; project-wide oldest results are withheld."}
        {client.refreshing && " Refreshing the task inventory in resumable pages."}</p>
      <p>Inventory as of: {client.metadataCompletedAt ? new Date(client.metadataCompletedAt).toLocaleString() : "Not current or not completed"}</p>
      <p>Access checked: {client.accessCheckedAt ? new Date(client.accessCheckedAt).toLocaleString() : "Not current"}</p>
      <p>Last worker attempt: {client.lastAttemptAt ? new Date(client.lastAttemptAt).toLocaleString() : "Not started"}</p>
      <p>Last completed worker batch: {client.lastBatchAt ? new Date(client.lastBatchAt).toLocaleString() : "Not completed"}</p>
      {client.syncIssue && <p>Sync needs another attempt ({client.syncIssue}). Saved pages are retained.</p>}
      {client.unresolvedPeopleTasks > 0 && <p>Some assignee names are unresolved; person searches may be incomplete.</p>}
      {client.phase === "needs_sync" && <p>Saved records are retained; client AI requires a fresh successful access check before using this index.</p>}
    </article>;})}</div>
    {!clients.length && !error && <p>{checked ? "No eligible assigned client projects found." : "Loading project index status…"}</p>}
  </main>;
}
