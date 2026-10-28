"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./portal-usage.module.css";
import { providerBillingUrl, providerStatus } from "@/lib/openai-issues";
import AiSpending from "./ai-spending";

const number = value => new Intl.NumberFormat().format(Number(value) || 0);

function remainingPercent(remaining, allowance) {
  const limit = Math.max(0, Number(allowance) || 0);
  return limit ? Math.min(100, Math.max(0, (Number(remaining) / limit) * 100)) : 0;
}

function CapacityBar({ allowance, label, remaining }) {
  const percent = remainingPercent(remaining, allowance);
  return (
    <div
      className={styles.capacityBar}
      aria-label={label}
      aria-valuemax={allowance}
      aria-valuemin="0"
      aria-valuenow={remaining}
      role="progressbar"
    ><i style={{ width: `${percent}%` }} /></div>
  );
}

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
  const provider = data?.provider === "openrouter" ? "openrouter" : "openai";
  const providerLabel = data?.providerLabel || (provider === "openrouter" ? "OpenRouter" : "OpenAI");
  const apiStatus = providerStatus(data?.apiStatus?.code, provider);
  const enabledClients = data?.clients.filter(client => client.enabled) || [];
  const combinedAllowance = enabledClients.reduce((sum, client) => sum + client.allowance, 0);
  const combinedRemaining = enabledClients.reduce((sum, client) => sum + client.remaining, 0);
  const combinedUsed = Math.max(0, combinedAllowance - combinedRemaining);
  const accountStatus = apiStatus.code === "ready"
    ? "Available"
    : apiStatus.code === "unknown" ? "Not checked" : "Attention needed";

  return (
    <section className={styles.panel} id="portal-usage" aria-labelledby="portal-usage-title">
      <div className={styles.heading}>
        <div><h2 id="portal-usage-title">AI request capacity</h2><p>Live portal allowances and the latest recorded {providerLabel} connection status.</p></div>
        <button type="button" onClick={() => refreshRef.current?.()}>Refresh usage</button>
      </div>
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
          <div className={styles.capacityMetric}>
            <span>Combined client capacity</span>
            <strong>{number(combinedRemaining)} left</strong>
            <small>{number(combinedUsed)} of {number(combinedAllowance)} requests used this UTC month</small>
            <CapacityBar allowance={combinedAllowance} label="Combined client requests remaining" remaining={combinedRemaining} />
          </div>
          <div>
            <span>AI-enabled clients</span>
            <strong>{number(enabledClients.length)}</strong>
            <small>{number((data.clients || []).length - enabledClients.length)} paused or unavailable</small>
          </div>
          <div>
            <span>{providerLabel} API status</span>
            <strong>{accountStatus}</strong>
            <small>Provider credits are separate from portal request allowances</small>
          </div>
        </div>

        {data.statusTrackingReady === false && <p className={styles.notice}>API status setup is incomplete. Run <code>npm run usage:migrate</code> against this deployment&apos;s database, then refresh.</p>}

        <div className={styles.clientCapacity}>
          <h3>Client monthly allowances</h3>
          <p>Each bar shows remaining portal requests. It updates after a completed or failed request.</p>
          <div className={styles.capacityList}>
            {data.clients.map((client, index) => (
              <article key={`${client.name}-${index}`} className={!client.enabled ? styles.paused : ""}>
                <div>
                  <strong>{client.name}</strong>
                  <span>{client.enabled ? `${number(client.remaining)} requests left` : "AI access paused"}</span>
                </div>
                <CapacityBar allowance={client.allowance} label={`${client.name} monthly requests remaining`} remaining={client.enabled ? client.remaining : 0} />
                <small>{number(client.used)} used · {number(client.allowance)} monthly limit</small>
              </article>
            ))}
          </div>
          {data.clients.length === 0 && <p>No client accounts yet.</p>}
        </div>

        <p className={styles.note}>These progress bars represent request limits configured inside this portal, not the provider account&apos;s cash or free-request balance. Requests can use different models, tools, and amounts of work.</p>
        <p className={styles.updated}>Updated {new Date(data.fetchedAt).toLocaleTimeString()}. Refreshes every 15 seconds while visible. Other applications using the same {providerLabel} account are not part of these portal allowances.</p>
      </>}
      <AiSpending />
    </section>
  );
}
