"use client";

import ActionCue from "@/components/portal-ui/action-cue";
import { useEffect, useState } from "react";
import Link from "next/link";
import { costStatus, spendingCsv, usd, unpricedReason } from "../../lib/ai-spending-format.js";
import styles from "./portal-usage.module.css";

export default function AiSpending() {
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [snapshot, setSnapshot] = useState({ data: null, error: "" });
  const [refresh, setRefresh] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    let inFlight = false;
    async function load() {
      if (inFlight || document.visibilityState === "hidden") return;
      inFlight = true;
      try {
        const response = await fetch(`/api/admin/ai-spending?month=${encodeURIComponent(month)}`, {
          cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Spending could not be loaded.");
        if (active) setSnapshot({ data, error: "", auditWarning: response.headers.get('X-AOC-Audit-Status')==='incomplete'
          ? 'Spending is available, but this refresh could not be added to the audit log.' : '' });
      } catch {
        if (active) setSnapshot({ data: null, error: "Spending could not be refreshed. No costs are assumed to be zero." });
      } finally { inFlight = false; }
    }
    void load();
    const timer = setInterval(load, 15000);
    document.addEventListener("visibilitychange", load);
    window.addEventListener("aoc:ai-usage-changed", load);
    return () => {
      active = false; controller.abort(); clearInterval(timer);
      document.removeEventListener("visibilitychange", load);
      window.removeEventListener("aoc:ai-usage-changed", load);
    };
  }, [month, refresh]);
  const data = snapshot.data?.period === month ? snapshot.data : null;
  function download() {
    if (!data?.ready) return;
    const url = URL.createObjectURL(new Blob([spendingCsv(data)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url; link.download = `client-api-spending-${month}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <section data-action-card="info" className={styles.spending} aria-labelledby="client-spending-title"><ActionCue tone="info">View costs · Read-only report</ActionCue>
    <div className={`${styles.heading} ${styles.spendingHeader}`}>
      <div><h3 id="client-spending-title">Client API spending · USD</h3>
        <p>Recorded provider costs for review. Active client plans enforce separate AI credit limits.</p></div>
      <Link className={styles.plansLink} href="/admin/credits" prefetch={false}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3zM3 9h18M7 14h3M15 14h2"/></svg>
        Client plans & credits
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14m-6-6 6 6-6 6"/></svg>
      </Link>
    </div>
    <div className={styles.spendingActions} role="group" aria-label="Spending report controls">
      <label>UTC month <input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
      <button type="button" onClick={() => setRefresh(value => value + 1)}>Refresh costs</button>
      <button type="button" disabled={!data?.ready} onClick={download}>Export CSV</button>
    </div>
    {snapshot.auditWarning && <p className={styles.notice} role="status">{snapshot.auditWarning}</p>}
    {snapshot.error && <p className={styles.error} role="alert">{snapshot.error}</p>}
    {!data && !snapshot.error && <p role="status">Loading client spending…</p>}
    {data && !data.ready && <p className={styles.notice} role="status">{data.setupMessage}</p>}
    {data?.ready && <>
      <div className={styles.spendingTable}>
        <table><caption>Recorded API costs for {month} (UTC)</caption>
          <thead><tr><th>Client</th><th>Known subtotal</th><th>Provider reported</th><th>Estimated</th><th>Coverage</th></tr></thead>
          <tbody>{data.clients.map(client => <tr key={client.slug}>
            <th scope="row">{client.name}</th><td>{usd(client.knownUsd)}</td><td>{usd(client.reportedUsd)}</td>
            <td>{usd(client.estimatedUsd)}</td><td><strong>{costStatus(client)}</strong><br />
              {client.turns} recorded replies · {client.unpricedEvents} unpriced events · {client.missingTurns} replies missing costs
              {client.unpricedReasons?.length > 0 && <><br />{client.unpricedReasons.map(unpricedReason).join("; ")}</>}</td>
          </tr>)}</tbody>
        </table>
      </div>
      {!data.clients.length && <p>No client accounts yet.</p>}
      <p className={styles.note}>OpenAI amounts are estimates using saved, published standard pricing and actual reported tokens.
        OpenRouter amounts are provider-reported when supplied. Unknown models, missing usage, failed/cancelled calls,
        images and paid tools may leave the subtotal incomplete. Storage and other account charges require billing reconciliation.
        These figures are not an invoice, prepaid balance or automatic client charge; agree extension fees separately.</p>
      <p className={styles.updated}>Tracking started {data.trackingStartedAt ? new Date(data.trackingStartedAt).toLocaleString() : "not recorded"}.
        Earlier spending is not backfilled. Cleared activity and dollar usage are excluded from this report. Credit accounting and provider invoices are unchanged.
        Updated {new Date(data.fetchedAt).toLocaleTimeString()}.</p>
    </>}
  </section>;
}
