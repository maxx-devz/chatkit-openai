"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./portal-usage.module.css";
import { providerBillingUrl, providerStatus } from "@/lib/openai-issues";
import AiSpending from "./ai-spending";
import ClearAiUsageHistory from "./clear-ai-usage-history";

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
        if (active) setSnapshot({ data, error: "", auditWarning: response.headers.get('X-AOC-Audit-Status')==='incomplete'
          ? 'Usage is available, but this refresh could not be added to the audit log.' : '' });
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
  const provider = data?.provider === "openrouter" ? "openrouter" : "openai";
  const providerLabel = data?.providerLabel || (provider === "openrouter" ? "OpenRouter" : "OpenAI");
  const apiStatus = data?.providerCredentialReady === false
    ? { code: "credential_unreadable", title: "Saved provider key needs attention", message: data.providerCredentialMessage }
    : providerStatus(data?.apiStatus?.code, provider);
  const enabledClients = data?.clients.filter(client => client.enabled) || [];
  const combinedUsed = (data?.clients || []).reduce((sum,client)=>sum+client.used,0);
  const accountStatus = apiStatus.code === "ready"
    ? "Last request succeeded"
    : apiStatus.code === "unknown" ? "Not checked" : "Attention needed";

  return (
    <section className={styles.panel} id="portal-usage" aria-labelledby="portal-usage-title">
      <div className={styles.heading}>
        <div><h2 id="portal-usage-title">AI chat usage & provider status</h2><p>Recorded chat activity and the latest {providerLabel} API result. Client credit limits follow their active plans.</p></div>
        <button type="button" onClick={() => refreshRef.current?.()}>Refresh usage</button>
      </div>
      {snapshot.auditWarning && <p className={styles.notice} role="status">{snapshot.auditWarning}</p>}
      {error && <p className={styles.error} role="alert">{error} {data ? "The figures below are from the last successful refresh." : ""}</p>}
      {!data && !error && <p role="status">Loading usage...</p>}
      {data && <>
        <div className={apiStatus.code === "unknown" || apiStatus.code === "ready" ? styles.apiStatus : styles.apiBlocked} role="status">
          <strong>{apiStatus.title}</strong>
          <p>{apiStatus.message}</p>
          {apiStatus.billing && <a href={providerBillingUrl(provider)} target="_blank" rel="noreferrer">Open {provider === "openrouter" ? "OpenRouter credits" : "OpenAI billing"}</a>}
          <small>{data.apiStatus?.observedAt
            ? `Admin assistant · ${data.apiStatus.model} · Last observed ${new Date(data.apiStatus.observedAt).toLocaleString()}.`
            : "No recorded API result for the current key."} This status updates after an admin assistant request; refreshing does not make a provider request.</small>
        </div>

        <div className={styles.metrics}>
          <div><span>Client AI chats this UTC month</span><strong>{number(combinedUsed)} recorded</strong><small>Reporting counts only. Credit limits follow active plans.</small></div>
          <div>
            <span>AI-enabled clients</span>
            <strong>{number(enabledClients.length)}</strong>
            <small>{number((data.clients || []).length - enabledClients.length)} paused or unavailable</small>
          </div>
          <div>
            <span>{providerLabel} API status</span>
            <strong>{accountStatus}</strong>
            <small>Provider availability and quotas are managed by the selected provider</small>
          </div>
        </div>

        {data.statusTrackingReady === false && <p className={styles.notice}>API status setup is incomplete. Run <code>npm run usage:migrate</code> against this deployment&apos;s database, then refresh.</p>}

        <div className={styles.clientCapacity}>
          <h3>Client AI chat activity</h3>
          <p>Recorded activity updates after replies finish. Credit limits are managed in each client’s plan.</p>
          <div className={styles.capacityList}>
            {data.clients.map((client, index) => (
              <article key={`${client.name}-${index}`} className={!client.enabled ? styles.paused : ""}>
                <div>
                  <strong>{client.name}</strong>
                  <span>{client.enabled ? `${number(client.used)} recorded AI chats` : "AI access paused"}</span>
                </div>
                <small>View credit limits in the client’s plan</small>
              </article>
            ))}
          </div>
          {data.clients.length === 0 && <p>No client accounts yet.</p>}
        </div>

        <p className={styles.note}>Usage counts describe recorded chat activity. Costs and credits are reported separately; provider quotas still apply.</p>
        <p className={styles.updated}>Updated {new Date(data.fetchedAt).toLocaleTimeString()}. Refreshes every 15 seconds while visible. Other applications using the same {providerLabel} account are not included in this activity.</p>
      </>}
      {data && <ClearAiUsageHistory clients={data.clients}/>}
      <AiSpending />
    </section>
  );
}
