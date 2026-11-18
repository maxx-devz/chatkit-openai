"use client";

import {useEffect,useRef,useState} from "react";
import {createClientIndexMonitor,clientIndexComplete} from "@/lib/hubstaff-index-monitor";
import styles from "./client-hubstaff-index.module.css";

const count=value=>new Intl.NumberFormat().format(Number(value)||0);
const date=value=>value?new Date(value).toLocaleString():"Not yet";

export default function ClientHubstaffIndex({clientId,projectUrl,enabled,mappingChanged}) {
  const [client,setClient]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [busy,setBusy]=useState(false);
  const [running,setRunning]=useState(false);
  const [error,setError]=useState("");
  const monitor=useRef(null);
  useEffect(()=>{
    if(!enabled || !projectUrl?.trim()) return;
    const instance=createClientIndexMonitor({clientId,onClient:value=>{setClient(value);setLoaded(true);},
      onBusy:setBusy,onRunning:setRunning,onError:setError});
    monitor.current=instance;instance.start();
    return ()=>{instance.stop();monitor.current=null;};
  },[clientId,projectUrl,enabled]);
  const complete=clientIndexComplete(client);
  const active=busy || client?.syncing;
  const label=active?"Syncing":client?.queuedAt?"Queued":running?"Waiting for next batch"
    :complete?"Up to date":client?.savedMetadataComplete?"Task inventory saved"
      :loaded?"Ready to sync":"Loading status";
  return <section className={styles.panel} aria-label="Client project index">
    <div className={styles.heading}>
      <div><h4>Project task index</h4><p>Prepare this client&apos;s task history for faster Work answers.</p></div>
      <button type="button" disabled={!enabled || !projectUrl?.trim() || mappingChanged || active || running || Boolean(client?.queuedAt)}
        onClick={()=>void monitor.current?.queue()}>
        {active?"Syncing…":client?.queuedAt || running?"Sync queued":"Start syncing"}
      </button>
    </div>
    {!enabled?<p>Enable and save portal and AI access before syncing.</p>
      :!projectUrl?.trim()?<p>Save a Hubstaff project URL to start indexing.</p>
      :<><p className={styles.status} role="status">{label}</p>
        <dl className={styles.counts}>
          <div><dt>Tasks saved</dt><dd>{client?count(client.savedTaskCount):"—"}</dd></div>
          <div><dt>Comments saved</dt><dd>{client?count(client.savedCommentCount):"—"}</dd></div>
          <div><dt>Discussions completed</dt><dd>{client?count(Math.max(0,client.savedTaskCount-client.savedPendingTasks)):"—"}</dd></div>
          <div><dt>Discussions pending</dt><dd>{client?count(client.savedPendingTasks):"—"}</dd></div>
        </dl>
        <p className={styles.batch}>{client?.lastBatchAt && client.lastBatchTasks!==null && client.lastBatchComments!==null
          ?<>Last completed batch: <strong>{count(client.lastBatchTasks)} tasks · {count(client.lastBatchComments)} comments</strong> processed and saved.<br/>{date(client.lastBatchAt)}</>
          :client?.lastBatchAt
            ?<>Last completed batch: {date(client.lastBatchAt)}. Processed counts will appear after the next completed batch.</>
            :"No completed batch recorded yet."}</p>
        <small>Saved totals count unique records. Processed counts include updates to existing records.</small>
        {client?.lastAttemptAt && <small>Last attempt: {date(client.lastAttemptAt)}</small>}
        {client?.accessCheckedAt && <small>Access checked: {date(client.accessCheckedAt)}</small>}
        {client && !client.available && client.savedTaskCount>0 && <p>Saved history is retained. Client AI needs a successful access check before using it.</p>}
        {client?.savedPendingTasks>0 && <p>Discussion indexing is still in progress; saved tasks can already support Work answers when access is verified.</p>}
        {client?.syncIssue && <p>Sync needs another attempt. Check Hubstaff access if this continues.</p>}
      </>}
    {mappingChanged && <p>Save the changed Hubstaff project URL before starting sync.</p>}
    {error && <p className={styles.error} role="alert">{error}</p>}
    <small>Only this client&apos;s saved Hubstaff project is indexed. A configured background worker continues with this page closed. General chat does not use task history.</small>
  </section>;
}
