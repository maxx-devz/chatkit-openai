"use client";

import { useEffect, useState } from "react";
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
        if (active) setSnapshot({ data, error: "" });
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
  return <section className={styles.spending} aria-labelledby="client-spending-title">
    <div className={styles.heading}>
      <div><h3 id="client-spending-title">Client API spending · USD</h3>
        <p>For extension pricing and billing review. Separate from monthly request allowances.</p></div>
      <div className={styles.spendingActions}>
        <label>UTC month <input type="month" value={month} onChange={event => setMonth(event.target.value)} /></label>
        <button type="button" onClick={() => setRefresh(value => value + 1)}>Refresh costs</button>
        <button type="button" disabled={!data?.ready} onClick={download}>Export CSV</button>
      </div>
    </div>
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
        Earlier spending is not backfilled. Resetting request allowances does not erase this ledger.
        Updated {new Date(data.fetchedAt).toLocaleTimeString()}.</p>
    </>}
  </section>;
}
