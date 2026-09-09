"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./portal-usage.module.css";
import { providerStatus, OPENAI_BILLING_URL } from "@/lib/openai-issues";

const labels = { client: "Client ChatKit", admin: "Admin assistant", preview: "Draft tests" };
const number = value => new Intl.NumberFormat().format(Number(value) || 0);

export default function PortalUsage() {
  const [snapshot, setSnapshot] = useState({ data: null, error: "" });
  const refreshRef = useRef(null);
  useEffect(() => {
    let active = true;
    let inFlight = false;
    let refreshQueued = false;
    const controller = new AbortController();
    async function refresh() {
      if (document.visibilityState === "hidden") return;
      if (inFlight) { refreshQueued = true; return; }
      inFlight = true;
      try {
        const response = await fetch("/api/admin/ai-usage", { cache: "no-store",
          signal: AbortSignal.any([controller.signal, AbortSignal.timeout(15000)]) });
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "Usage could not be refreshed.");
        if (active) setSnapshot({ data, error: "" });
      } catch (error) {
        if (active) setSnapshot(previous => ({ ...previous,
          error: error.name === "TimeoutError" ? "Usage refresh timed out. Try again." : error.message || "Usage could not be refreshed." }));
      } finally {
        inFlight = false;
        if (active && refreshQueued) { refreshQueued = false; void refresh(); }
      }
    }
    refreshRef.current = refresh;
    void refresh();
    const interval = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("aoc:ai-usage-changed", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      active = false;
      controller.abort();
      clearInterval(interval);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("aoc:ai-usage-changed", refresh);
      document.removeEventListener("visibilitychange", refresh);
      refreshRef.current = null;
    };
  }, []);

  const { data, error } = snapshot;
  const apiStatus = providerStatus(data?.apiStatus?.code);
  const totalTokens = data?.activity.reduce((sum, row) => sum + Number(row.total_tokens), 0) || 0;
  const remaining = data?.clients.reduce((sum, row) => sum + (row.enabled ? row.remaining : 0), 0) || 0;
  const trackedFrom = data?.activity.map(row => row.first_recorded_at).sort()[0];
  return (
    <section className={styles.panel} id="portal-usage" aria-labelledby="portal-usage-title">
      <div className={styles.heading}>
        <div><h2 id="portal-usage-title">Portal AI usage</h2><p>Client chats, your admin assistant, and staff draft tests.</p></div>
        <button type="button" onClick={() => refreshRef.current?.()}>Refresh usage</button>
      </div>
      {error && <p className={styles.error} role="alert">{error} {data ? "The figures below are from the last successful refresh." : ""}</p>}
      {!data && !error && <p role="status">Loading usage...</p>}
      {data && <>
        <div className={apiStatus.code === "unknown" || apiStatus.code === "ready" ? styles.apiStatus : styles.apiBlocked} role="status">
          <strong>{apiStatus.title}</strong>
          <p>{apiStatus.message}</p>
          {apiStatus.billing && <a href={OPENAI_BILLING_URL} target="_blank" rel="noreferrer">Open OpenAI billing</a>}
          <small>{data.apiStatus?.observedAt
            ? `Admin assistant · ${data.apiStatus.model} · Last observed ${new Date(data.apiStatus.observedAt).toLocaleString()}.`
            : "No recorded admin API result for the current key."} Refresh reads the recorded status; it does not make an API request. After fixing billing, retry your message to check access again.</small>
        </div>
        <div className={styles.metrics}>
          <div><span>Recorded text-agent tokens</span><strong>{data.trackingReady ? number(totalTokens) : "Setup needed"}</strong><small>{data.period} · UTC month</small></div>
          <div><span>Enabled-client requests left</span><strong>{number(remaining)}</strong><small>Separate allowances per client</small></div>
          <div><span>OpenAI credit balance</span><strong>Amount unavailable</strong><small><a href={OPENAI_BILLING_URL} target="_blank" rel="noreferrer">View billing and credits</a></small></div>
        </div>
        {(!data.trackingReady || data.statusTrackingReady === false) && <p className={styles.notice}>Usage tracking setup is incomplete. Run <code>npm run usage:migrate</code> against this deployment&apos;s database, then refresh.</p>}
        {data.trackingReady && <>
          <div className={styles.tableWrap}><table>
            <caption>Recorded runs this month</caption>
            <thead><tr><th scope="col">Source</th><th scope="col">Runs</th><th scope="col">Input tokens</th><th scope="col">Output tokens</th><th scope="col">Without token report</th></tr></thead>
            <tbody>{Object.entries(labels).map(([source, label]) => {
              const row = data.activity.find(item => item.source === source) || {};
              return <tr key={source}><th scope="row">{label}</th><td>{number(row.runs)}</td><td>{number(row.input_tokens)}</td><td>{number(row.output_tokens)}</td><td>{number(Number(row.runs || 0) - Number(row.reported_runs || 0))}</td></tr>;
            })}</tbody>
          </table></div>
          <p className={styles.note}>{trackedFrom ? `First recorded run this month: ${new Date(trackedFrom).toLocaleString()}.` : "Tracking starts with the next AI run."} Earlier admin and client calls are not backfilled. Runs include failed attempts; interrupted runs may have incomplete token reports. Image generation and other tool charges are excluded from text-agent token totals.</p>
        </>}
        <div className={styles.tableWrap}><table>
          <caption>Current client allowances</caption>
          <thead><tr><th scope="col">Client</th><th scope="col">Access</th><th scope="col">Requests used</th><th scope="col">Monthly limit</th><th scope="col">Requests left</th></tr></thead>
          <tbody>{data.clients.map((client, index) => <tr key={index}><th scope="row">{client.name}</th><td>{client.enabled ? "Enabled" : "Paused"}</td><td>{number(client.used)}</td><td>{number(client.allowance)}</td><td>{number(client.remaining)}</td></tr>)}</tbody>
        </table>{data.clients.length === 0 && <p>No client accounts yet.</p>}</div>
        <p className={styles.note}>Client allowances are portal limits. Resetting one does not reset recorded AI usage or refund OpenAI credits. Admin chats have no monthly portal allowance; draft tests allow 20 replies per staff member per hour. A prompt can use different numbers of tokens, so these figures cannot predict how many prompts your OpenAI balance will buy.</p>
        <p className={styles.updated}>Updated {new Date(data.fetchedAt).toLocaleTimeString()}. Refreshes every 15 seconds while visible; running replies appear after they finish. Totals cover this portal&apos;s database, not other apps using the same OpenAI account.</p>
      </>}
    </section>
  );
}
