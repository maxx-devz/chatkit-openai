"use client";
/* eslint-disable @next/next/no-img-element -- Explicit resource preview must preserve the captured URL and bytes. */
import { useEffect, useMemo, useRef, useState } from "react";
import NeuralGraph from "./graph";
import { isError, mergeRecords, statusColor, warningsFor } from "@/lib/debugger/model";
import { endpointKey } from "@/lib/debugger/scene";
import { watchDebuggerSession } from "@/lib/debugger/browser-session";
import { debuggerPortalPath } from "@/lib/debugger/routing";
import styles from "./debugger.module.css";

const CATEGORIES = ["document", "image", "script", "css", "font", "api", "media", "websocket", "eventsource", "other", "error", "performance", "navigation", "operation"];
const bytes = (n) => n == null ? "Unavailable" : n > 1_000_000 ? `${(n / 1_000_000).toFixed(2)} MB` : `${(n / 1000).toFixed(1)} KB`;
const ms = (n) => n == null ? "Unavailable" : `${Math.round(n).toLocaleString()} ms`;
function Metric({ label, value, note }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</div>; }
function Inspector({ record, onClose, slowMs, occurrences = [], onSelect }) {
  const [tab, setTab] = useState("Overview"), [preview, setPreview] = useState(false);
  const [historyLimit, setHistoryLimit] = useState(40);
  if (!record) return <aside className={styles.inspector}><div className={styles.inspectorEmpty}>Select a resource<span>Inspect captured headers, timing, errors and initiator evidence.</span></div></aside>;
  const general = { "Sanitized URL": record.url, Category: record.category, Method: record.method, Status: record.status ? `HTTP ${record.status}` : "Unavailable", State: record.state, "Capture source": record.source, "Request ID": record.id, "Tab ID": record.tabId, "Navigation ID": record.navigationId, "Parent / correlation": record.parentId, "Initiator URL": record.initiatorUrl, "Initiator type": record.initiatorType, "Relationship evidence": record.relationship, Priority: record.priority, Protocol: record.protocol, Cache: record.cache || "Unknown", "Service worker": record.serviceWorker == null ? "Unavailable" : String(record.serviceWorker), Started: record.start ? new Date(record.start).toLocaleTimeString() : undefined, Finished: record.end ? new Date(record.end).toLocaleTimeString() : undefined, Duration: ms(record.duration), "Headers received": record.headersAt ? new Date(record.headersAt).toLocaleTimeString() : undefined, "Transfer size": bytes(record.transferSize), "Encoded resource": bytes(record.encodedSize), "Decoded resource": bytes(record.decodedSize), "Render blocking": record.renderBlocking, "Frames/messages received": record.messagesReceived, "Frames/messages sent": record.messagesSent };
  const warnings = warningsFor(record, slowMs);
  let canPreview = false;
  try { const url = new URL(record.url); canPreview = record.category === "image" && url.origin === location.origin && !url.search; } catch { /* No safe preview URL. */ }
  return <aside className={styles.inspector}>
    <div className={styles.inspectorHeading}><div><span className={styles.type} style={{ color: statusColor(record) }}>{record.category}</span><h2>{record.label || "Resource inspector"}</h2></div><button onClick={onClose} aria-label="Close inspector">×</button></div>
    <div className={styles.inspectorTabs}>{["Overview", "Headers", "Payload", "Response", "Timing"].map((name) => <button className={tab === name ? styles.active : ""} onClick={() => setTab(name)} key={name}>{name}</button>)}</div>
    <div className={styles.inspectorContent}>
      {tab === "Overview" ? <><dl>{Object.entries(general).map(([key, value]) => <div key={key}><dt>{key}</dt><dd>{value ?? "Unavailable"}</dd></div>)}</dl>
        {occurrences.length > 1 ? <section aria-label="Endpoint request history"><h3>Same endpoint · {occurrences.length} captured requests</h3><p className={styles.muted}>Query parameters are grouped visually. Each call keeps its own status, timing and request ID.</p>{occurrences.slice(0, historyLimit).map((request) => <button type="button" key={request.id} className={`${styles.occurrence} ${request.id === record.id ? styles.selectedRow : ""}`} aria-pressed={request.id === record.id} onClick={() => onSelect(request.id)}><i style={{ background: statusColor(request) }} /><span>{request.method || "GET"} · {request.status ? `HTTP ${request.status}` : request.state}<small>{request.start ? new Date(request.start).toLocaleTimeString() : "Time unavailable"} · {ms(request.duration)}</small></span></button>)}{occurrences.length > historyLimit ? <button onClick={() => setHistoryLimit((value) => value + 40)}>Show more requests</button> : null}</section> : null}
        {record.image ? <><h3>Image dimensions</h3><pre>{JSON.stringify(record.image, null, 2)}</pre></> : null}
        {canPreview ? <><button onClick={() => setPreview((v) => !v)}>{preview ? "Hide preview" : "Load same-origin image preview"}</button>{preview ? <img className={styles.preview} src={record.url} alt="Captured resource preview" /> : null}</> : null}
        {record.error ? <div className={styles.errorBox}>{record.error}</div> : null}{record.stack ? <pre>{record.stack}</pre> : null}
        {warnings.length ? <><h3>Observed warnings / candidates</h3>{warnings.map((warning) => <p className={styles.warning} key={warning}>{warning}</p>)}</> : null}
        <p className={styles.muted}>{record.observation || "Unavailable fields were not exposed by this capture mode. A graph connection is not proof of a critical-path dependency."}</p>
      </> : null}
      {tab === "Headers" ? <><h3>Permitted request headers</h3><pre>{JSON.stringify(record.requestHeaders || {}, null, 2)}</pre><h3>Permitted response headers</h3><pre>{JSON.stringify(record.responseHeaders || {}, null, 2)}</pre><p className={styles.muted}>Credential headers, cookies and query values are removed before transport.</p></> : null}
      {tab === "Payload" ? <><pre>{record.payload ? JSON.stringify(record.payload, null, 2) : "Payload not captured. User input and AI conversations are excluded by default."}</pre></> : null}
      {tab === "Response" ? <><pre>{record.responsePreview || "Response body unavailable. JSON previews require explicit environment opt-in and a safe GET path allowlist. Images, AI streams and credentials are not copied."}</pre></> : null}
      {tab === "Timing" ? <><dl>{["queue", "dns", "connect", "tls", "send", "ttfb", "download", "redirect"].map((phase) => <div key={phase}><dt>{phase.toUpperCase()}</dt><dd>{ms(record.timing?.[phase])}</dd></div>)}</dl><p className={styles.muted}>Only browser-supplied phases are shown. Network transfer and JavaScript execution durations are separate observations.</p></> : null}
    </div>
  </aside>;
}
export default function DebuggerDashboard({ config, portalPath = "/" }) {
  const map = useRef(new Map()), sessionMap = useRef(new Map());
  const [records, setRecords] = useState([]), [sessions, setSessions] = useState([]), [connection, setConnection] = useState("Live · this browser only");
  const [tabId, setTabId] = useState(""), [navigation, setNavigation] = useState("latest"), [view, setView] = useState("graph");
  const [category, setCategory] = useState("all"), [search, setSearch] = useState(""), [errorsOnly, setErrorsOnly] = useState(false), [slowOnly, setSlowOnly] = useState(false);
  const [slowMs, setSlowMs] = useState(1500), [group, setGroup] = useState("endpoint"), [showSizes, setShowSizes] = useState(false), [selectedId, setSelectedId] = useState(null);
  const [maximized, setMaximized] = useState(false);
  const [limit, setLimit] = useState(200), [paused, setPaused] = useState(false);
  const [clock, setClock] = useState(0);
  const pausedRef = useRef(false);
  useEffect(() => { pausedRef.current = paused; }, [paused]);
  useEffect(() => {
    if (!maximized) return;
    const previous = { body: document.body.style.overflow, html: document.documentElement.style.overflow };
    document.body.style.overflow = "hidden"; document.documentElement.style.overflow = "hidden";
    const escape = (event) => { if (event.key === "Escape") { event.preventDefault(); setMaximized(false); } };
    document.addEventListener("keydown", escape);
    return () => { document.body.style.overflow = previous.body; document.documentElement.style.overflow = previous.html; document.removeEventListener("keydown", escape); };
  }, [maximized]);
  useEffect(() => {
    let dirty = false, expired = false, lastClock = 0;
    const receive = (batch, session) => {
      if (expired) return;
      if (session?.tabId) sessionMap.current.set(session.tabId, { ...sessionMap.current.get(session.tabId), ...session });
      if (Array.isArray(batch)) {
        for (const record of batch) if (record.category === "session" && record.tabId) sessionMap.current.set(record.tabId, { ...sessionMap.current.get(record.tabId), ...record });
        mergeRecords(map.current, batch.filter((record) => record.category !== "session").slice(0, config.maxRecords), config.maxRecords);
      }
      dirty = true;
    };
    const channel = new BroadcastChannel(config.channel);
    const expire = (notify = false) => {
      if (expired) return;
      expired = true;
      if (notify) channel.postMessage({ type: "access-ended" });
      channel.close(); map.current.clear(); sessionMap.current.clear();
      setRecords([]); setSessions([]); setSelectedId(null);
      setConnection("Session ended or authorization expired — reload to continue");
    };
    channel.onmessage = ({ data }) => {
      if (data?.type === "access-ended") { expire(); return; }
      if (["records", "snapshot", "presence"].includes(data?.type)) receive(data.records, data.session);
      if (data?.type === "closed" && sessionMap.current.has(data.tabId)) { sessionMap.current.get(data.tabId).closed = true; dirty = true; }
    };
    channel.postMessage({ type: "snapshot-request" });
    const stopWatching = watchDebuggerSession(config, () => expire(true), window.fetch.bind(window));
    const timer = setInterval(() => {
      if (expired || pausedRef.current || document.hidden) return;
      if (Date.now() - lastClock > 900) { lastClock = Date.now(); setClock(lastClock); }
      if (dirty) { dirty = false; setRecords([...map.current.values()]); setSessions([...sessionMap.current.values()]); }
    }, 150);
    const expires = setTimeout(() => expire(true), Math.max(0, config.expiresAt - Date.now()));
    return () => { expired = true; stopWatching(); channel.close(); clearInterval(timer); clearTimeout(expires); };
  }, [config]);
  const selectedSession = sessions.find((s) => s.tabId === tabId) || sessions.at(-1);
  const selectedTab = tabId || selectedSession?.tabId;
  const pageRecords = useMemo(() => records.filter((r) => (!selectedTab || r.tabId === selectedTab) && (navigation === "all" || r.navigationId === (navigation === "latest" ? selectedSession?.navigationId : navigation))), [records, selectedTab, selectedSession?.navigationId, navigation]);
  const filtered = useMemo(() => pageRecords.filter((r) => (category === "all" || r.category === category) && (!errorsOnly || isError(r)) && (!slowOnly || (r.duration || (r.start && ["pending", "receiving"].includes(r.state) ? clock - r.start : 0)) > slowMs) && (!search || `${r.url} ${r.label} ${r.category}`.toLowerCase().includes(search.toLowerCase()))), [pageRecords, category, errorsOnly, slowOnly, slowMs, search, clock]);
  const resourceRecords = pageRecords.filter((r) => !["navigation", "performance", "error", "operation"].includes(r.category));
  const active = resourceRecords.filter((r) => ["pending", "receiving"].includes(r.state)).length;
  const metrics = selectedSession?.metrics || {};
  const selected = records.find((r) => r.id === selectedId);
  const occurrences = useMemo(() => { const key = selected && endpointKey(selected); return key ? pageRecords.filter((r) => endpointKey(r) === key).sort((a, b) => (b.start || 0) - (a.start || 0)) : []; }, [selected, pageRecords]);
  const navigations = [...new Set(records.filter((r) => r.tabId === selectedTab).map((r) => r.navigationId).filter(Boolean))];
  const start = filtered.length ? Math.min(...filtered.map((r) => r.start || 0)) : 0, end = Math.max(...filtered.map((r) => r.end || ((r.start || 0) + (r.duration || 0))), start + 1000);
  const domains = new Map();
  for (const record of resourceRecords) { let domain; try { domain = new URL(record.url).host; } catch { continue; } const value = domains.get(domain) || { count: 0, bytes: 0 }; value.count++; value.bytes += record.transferSize || 0; domains.set(domain, value); }
  function clear() { map.current.clear(); setRecords([]); setSelectedId(null); }
  return <main className={styles.page}>
    <header className={styles.header}><div className={styles.brandMark}>◉</div><div><span className={styles.eyebrow}>AOC developer observatory</span><h1>Neural network debugger</h1></div><div className={styles.headerActions}><span className={styles.live}>{connection}</span><a href={debuggerPortalPath(portalPath)} target="_blank" rel="noreferrer">Open portal ↗</a><button onClick={() => setPaused((v) => !v)}>{paused ? "Resume display" : "Pause display"}</button><button onClick={clear}>Clear history</button></div></header>
    <div className={styles.captureBar}><label>Monitored tab<select aria-label="Monitored tab" value={selectedTab || ""} onChange={(e) => { setTabId(e.target.value); setNavigation("latest"); }}>{!sessions.length ? <option value="">Waiting for a portal tab</option> : null}{sessions.map((s) => <option value={s.tabId} key={s.tabId}>{s.pageUrl} · {s.tabId.slice(-6)} · {s.mode}{s.closed ? " (closed / refreshed)" : ""}</option>)}</select></label><label>Navigation<select aria-label="Navigation" value={navigation} onChange={(e) => setNavigation(e.target.value)}><option value="latest">Current page load</option><option value="all">All retained page loads</option>{navigations.map((nav, index) => <option key={nav} value={nav}>Page load {index + 1} · {nav.slice(-8)}</option>)}</select></label><span className={styles.captureMode}>{selectedSession?.mode === "deep" ? "CDP deep capture active" : "Browser baseline capture"}</span><span className={styles.muted}>{records.length} / {config.maxRecords} retained records · {selectedSession?.callbackMs ?? "—"} ms measured recording callback work</span></div>
    <section className={styles.metrics} aria-label="Captured network summary"><Metric label="Requests" value={resourceRecords.length} /><Metric label="Active" value={active} /><Metric label="HTTP success" value={resourceRecords.filter((r) => r.status >= 200 && r.status < 300).length} /><Metric label="Errors" value={pageRecords.filter(isError).length} /><Metric label="Known transfer" value={bytes(resourceRecords.reduce((sum, r) => sum + (r.transferSize || 0), 0))} /><Metric label="Known decoded" value={bytes(resourceRecords.reduce((sum, r) => sum + (r.decodedSize || 0), 0))} /><Metric label="Third-party" value={resourceRecords.filter((r) => r.thirdParty).length} /><Metric label="Known cached" value={resourceRecords.filter((r) => /cache/.test(r.cache || "") && !/unknown/.test(r.cache || "")).length} /></section>
    <section className={styles.vitals} aria-label="Observed browser metrics">{["TTFB", "FCP", "LCP", "CLS", "INP", "DCL", "Load"].map((name) => <Metric key={name} label={name} value={name === "CLS" && metrics[name] != null ? metrics[name].toFixed(3) : ms(metrics[name])} note={name === "INP" && metrics.INP == null ? "Awaiting qualifying interaction" : undefined} />)}</section>
    <div className={styles.toolbar}>
      <div className={styles.viewTabs}>{[["graph", "Neural graph"], ["waterfall", "Network waterfall"], ["performance", "Performance"]].map(([key, label]) => <button className={view === key ? styles.active : ""} onClick={() => { setView(key); setMaximized(false); }} key={key}>{label}</button>)}</div>
      <input aria-label="Search resources" placeholder="Search URL, name or resource…" value={search} onChange={(e) => setSearch(e.target.value)} />
      <select aria-label="Resource category" value={category} onChange={(e) => setCategory(e.target.value)}><option value="all">All resources</option>{CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat} ({pageRecords.filter((r) => r.category === cat).length})</option>)}</select>
      <select aria-label="Group nodes" value={group} onChange={(e) => setGroup(e.target.value)}><option value="endpoint">Group repeated endpoints</option><option value="type">Group by type</option><option value="domain">Group by domain</option><option value="navigation">Group by navigation</option><option value="none">Individual nodes</option></select>
    </div>
    <div className={styles.filterBar}><label><input type="checkbox" checked={errorsOnly} onChange={(e) => setErrorsOnly(e.target.checked)} />Errors only</label><label><input type="checkbox" checked={slowOnly} onChange={(e) => setSlowOnly(e.target.checked)} />Slow requests</label><label>Slow threshold <input aria-label="Slow threshold milliseconds" type="number" min="100" step="100" max="60000" value={slowMs} onChange={(e) => setSlowMs(Math.max(100, Number(e.target.value) || 1500))} />ms</label><label><input type="checkbox" checked={showSizes} onChange={(e) => setShowSizes(e.target.checked)} />Graph sizes</label><span>{filtered.length} matching records</span></div>
    <div className={`${styles.workspace} ${maximized && view === "graph" ? styles.workspaceMaximized : ""}`} aria-label="Graph and resource inspector workspace">
      <section className={styles.visualization}>
        {view === "graph" ? <NeuralGraph records={filtered} group={group} selectedId={selectedId} onSelect={setSelectedId} showSizes={showSizes} slowMs={slowMs} maximized={maximized} onToggleMaximize={() => setMaximized((value) => !value)} /> : null}
        {view === "waterfall" ? <div className={styles.waterfall}><div className={styles.tableHeader}><span>Resource / status</span><span>Duration · timing overlap ({ms(end - start)})</span></div>{[...filtered].sort((a, b) => (a.start || 0) - (b.start || 0)).slice(0, limit).map((r) => <button key={r.id} className={`${styles.waterfallRow} ${selectedId === r.id ? styles.selectedRow : ""}`} onClick={() => setSelectedId(r.id)}><span><i style={{ background: statusColor(r) }} /><strong>{r.url || r.label || r.category}</strong><small>{r.status || r.state} · {r.category} · {bytes(r.transferSize)}</small></span><span className={styles.timeline}><b style={{ left: `${Math.max(0, ((r.start || start) - start) / (end - start) * 100)}%`, width: `${Math.max(.3, (r.duration || 0) / (end - start) * 100)}%`, background: statusColor(r) }} /><em>{ms(r.duration)}</em></span></button>)}{filtered.length > limit ? <button onClick={() => setLimit((v) => v + 200)}>Show next 200 records</button> : null}</div> : null}
        {view === "performance" ? <div className={styles.performance}><h2>Page performance observations</h2><p>Local runtime observations. Values update during this page load; these are not CrUX field data or a Lighthouse score.</p><h3>Domains</h3>{[...domains].sort((a, b) => b[1].bytes - a[1].bytes).map(([domain, value]) => <div className={styles.domainRow} key={domain}><strong>{domain}</strong><span>{value.count} requests · {bytes(value.bytes)} known transfer</span></div>)}<h3>Potential bottlenecks and runtime events</h3>{filtered.filter((r) => warningsFor(r, slowMs).length || r.category === "performance").slice(0, limit).map((r) => <button className={styles.issue} key={r.id} onClick={() => setSelectedId(r.id)}><strong>{r.url || r.label}</strong><span>{warningsFor(r, slowMs).join(" · ") || r.observation} · {ms(r.duration)}</span></button>)}</div> : null}
      </section>
      <Inspector key={selectedId || "empty"} record={selected} slowMs={slowMs} occurrences={occurrences} onSelect={setSelectedId} onClose={() => setSelectedId(null)} />
    </div>
    <footer className={styles.footer}><strong>Capture coverage</strong><p>{selectedSession?.mode === "deep" ? "CDP observes actual network lifecycles, initiator evidence, redirects, cache and console events in the dedicated browser. Worker-owned traffic and out-of-process frame targets can be partially observed; body previews remain opt-in." : "Baseline resource entries arrive after completion. It cannot expose exact starts, all headers/bodies, redirect hops, worker traffic, or internals of cross-origin frames. Missing fields remain unavailable. Run npm run debugger:deep for the dedicated Chrome capture session."}</p><p>Retention is bounded and in memory. Display pause keeps recording. Dotted edges show page association, never an invented dependency. Debugger telemetry and this dashboard’s own requests are excluded.</p><a href="/debugger-lab" target="_blank" rel="noreferrer">Open authorized capture probes ↗</a></footer>
  </main>;
}
