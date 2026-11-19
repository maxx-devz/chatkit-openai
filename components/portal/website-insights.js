"use client";
import { useCallback, useEffect, useState } from "react";
import { compareReports, safePageLink, googleConnectionView } from "../../lib/website-insights/presentation.js";
import styles from "./website-insights.module.css";

const API = "/api/client/website-insights";
const stages = { discovery: "Checking crawl access and sitemap", crawl: "Checking public pages", mobile: "Measuring mobile performance", desktop: "Measuring desktop performance", search: "Reading connected Search Console data", complete: "Analysis complete" };
const tabs = [["overview", "Overview"], ["findings", "Findings"], ["performance", "Performance"], ["search", "Search & keywords"], ["geo", "AI search / GEO"], ["previews", "Page previews"], ["history", "History"]];
const fmt = (value, digits = 0) => typeof value === "number" && Number.isFinite(value) ? value.toLocaleString(undefined, { maximumFractionDigits: digits }) : "Unavailable";
const date = value => value ? new Date(value).toLocaleString() : "Not analyzed";
async function requestInsights(clientId, path = "", body, signal) {
  const response = await fetch(API + path, { cache: "no-store", ...(signal ? { signal } : {}),
    headers:{ "x-aoc-client":String(clientId),...(body ? { "Content-Type":"application/json" } : {}) },
    ...(body ? { method: "POST",body:JSON.stringify(body) } : {}) });
  const data = await response.json().catch(() => ({}));
  signal?.throwIfAborted();
  if (!response.ok) throw new Error(data.error || "Website Insights could not complete this request.");
  return data;
}
function PageLink({ url }) { const href = safePageLink(url); return href ? <a href={href} target="_blank" rel="noopener noreferrer">{url}</a> : <span>{url}</span>; }
function Metric({ label, value, note }) { return <div className={styles.metric}><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>; }
function Trend({ title, rows, field, suffix = "" }) {
  const values = rows.filter(row => typeof row[field] === "number" && Number.isFinite(row[field]));
  if (!values.length) return <div className={styles.chart}><h3>{title}</h3><p>No measured samples available yet.</p></div>;
  const max = Math.max(1, ...values.map(row => row[field])), min = Math.min(0, ...values.map(row => row[field]));
  const points = values.map((row, index) => `${20 + index / Math.max(1, values.length - 1) * 460},${110 - (row[field] - min) / (max - min) * 85}`);
  return <div className={styles.chart}><h3>{title}</h3><div className={styles.chartValue}>{fmt(values.at(-1)[field], 1)}{suffix}<small>Latest available sample · {values.length} point(s)</small></div>
    <svg viewBox="0 0 500 135" role="img" aria-label={`${title}: ${values.map(row => `${row.label}: ${row[field]}`).join(", ")}`}>
      <path d="M20 110H480 M20 65H480 M20 25H480" className={styles.gridLine} />
      <polyline points={points.join(" ")} fill="none" stroke="#086ac9" strokeWidth="3" />
      {points.map((point, index) => <circle key={index} cx={point.split(",")[0]} cy={point.split(",")[1]} r="4" fill="#086ac9" />)}
    </svg><small>{values[0].label} → {values.at(-1).label}. Available samples only; missing data is not zero.</small>
  </div>;
}
function FindingCard({ item }) {
  return <article className={styles.finding}>
    <div className={styles.findingTop}><span className={`${styles.pill} ${styles[item.severity]}`}>{item.severity === "opportunity" ? "Improvement" : item.severity}</span>
      <small>{item.category.toUpperCase()} · {item.kind === "suggestion" ? "Suggestion" : "Observed finding"}</small></div>
    <h3>{item.title}</h3><div className={styles.pageUrl}><PageLink url={item.page} /></div>
    <p><strong>Discovered</strong>{item.discovered}</p><p><strong>Why it matters</strong>{item.why}</p><p><strong>What to do</strong>{item.recommendation}</p>
  </article>;
}
function SearchResults({ search }) {
  if (search.status !== "available") return <div className={styles.empty}><h3>Real search data needs Search Console</h3><p>{search.message}</p><p>Website findings and available performance tests do not require this connection.</p></div>;
  return <>
    <div className={styles.notice}>{search.note}<br />{search.periods.current.startDate} – {search.periods.current.endDate} versus {search.periods.previous.startDate} – {search.periods.previous.endDate}.</div>
    <div className={styles.metrics}>
      <Metric label="Google clicks" value={fmt(search.summary?.clicks)} note={`Previous period: ${fmt(search.previous?.clicks)}`} />
      <Metric label="Search impressions" value={fmt(search.summary?.impressions)} note={`Previous period: ${fmt(search.previous?.impressions)}`} />
      <Metric label="Click-through rate" value={search.summary?.ctr == null ? "Unavailable" : `${fmt(search.summary.ctr * 100, 2)}%`} />
      <Metric label="Average search position" value={fmt(search.summary?.position, 1)} note="Not an exact live ranking" />
    </div>
    <div className={styles.chartGrid}><Trend title="Daily Google clicks" rows={search.trend.map(row => ({ ...row, label: row.date }))} field="clicks" />
      <Trend title="Daily Google impressions" rows={search.trend.map(row => ({ ...row, label: row.date }))} field="impressions" /></div>
    <h3>Keywords & ranking opportunities</h3><p className={styles.muted}>Top query/page pairs. Lower average position is generally better. “No previous data” does not mean the query is new.</p>
    <div className={styles.tableScroll}><table><thead><tr><th>Query / page</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Avg. position</th><th>Previous avg.</th><th>Visibility change</th><th>Opportunity</th></tr></thead>
      <tbody>{search.queries.map((row, index) => <tr key={index}><td><strong>{row.query}</strong><small><PageLink url={row.page} /></small></td><td>{fmt(row.clicks)}</td><td>{fmt(row.impressions)}</td><td>{row.ctr == null ? "Unavailable" : `${fmt(row.ctr * 100, 1)}%`}</td>
        <td>{fmt(row.position, 1)}</td><td>{row.previousPosition == null ? "No previous data" : fmt(row.previousPosition, 1)}</td>
        <td>{row.previousImpressions == null || row.impressions == null ? "No comparable impression data" : `${row.impressions > row.previousImpressions ? "Gained" : row.impressions < row.previousImpressions ? "Lost" : "Unchanged"}${row.impressions !== row.previousImpressions ? ` ${fmt(Math.abs(row.impressions - row.previousImpressions))}` : ""} impressions`}
          {row.previousPosition != null && row.position != null && <small>{row.position < row.previousPosition ? "Average position improved" : row.position > row.previousPosition ? "Average position declined" : "Average position unchanged"}{row.position !== row.previousPosition ? ` by ${fmt(Math.abs(row.position - row.previousPosition), 1)}` : ""}</small>}</td>
        <td>{row.impressions >= 100 && row.ctr < .02 ? "Review title/snippet (high impressions, low CTR)" : row.position >= 4 && row.position <= 20 ? "Review relevance and page content" : "Monitor"}</td></tr>)}</tbody></table></div>
    {!search.queries.length && <p>No query rows were returned for this period. Google may withhold queries or have no eligible data.</p>}
    <h3>Top-performing pages</h3><div className={styles.tableScroll}><table><thead><tr><th>Page</th><th>Clicks</th><th>Impressions</th><th>CTR</th><th>Avg. position</th></tr></thead>
      <tbody>{search.pages.map(row => <tr key={row.page}><td><PageLink url={row.page} /></td><td>{fmt(row.clicks)}</td><td>{fmt(row.impressions)}</td><td>{row.ctr == null ? "Unavailable" : `${fmt(row.ctr * 100, 1)}%`}</td><td>{fmt(row.position, 1)}</td></tr>)}</tbody></table></div>
  </>;
}
export default function WebsiteInsights({ clientId, canWrite, canManage, initialWebsite, connectionResult }) {
  const [websites, setWebsites] = useState([]), [siteId, setSiteId] = useState(initialWebsite || "");
  const [history, setHistory] = useState([]), [report, setReport] = useState(null), [google, setGoogle] = useState(null);
  const [properties, setProperties] = useState([]), [property, setProperty] = useState("");
  const [oauthResult, setOauthResult] = useState(connectionResult);
  const [tab, setTab] = useState("overview"), [category, setCategory] = useState("all"), [severity, setSeverity] = useState("all");
  const [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const [detailLoading, setDetailLoading] = useState(true);
  const [auto, setAuto] = useState(true), [adding, setAdding] = useState(false), [previous, setPrevious] = useState(null);
  const api = useCallback((path,body,signal) => requestInsights(clientId,path,body,signal),[clientId]);
  const selected = websites.find(site => site.id === siteId), result = report?.result;
  const connection = googleConnectionView(google, oauthResult);
  const reloadSites = useCallback(async signal => { const data = await api("", null, signal); setWebsites(data.websites); return data.websites; }, [api]);
  const reloadDetail = useCallback(async (id, signal) => { const data = await api(`?site=${encodeURIComponent(id)}`, null, signal); setHistory(data.history); setGoogle(data.google); setProperties(data.google.properties || []); setProperty(data.google.property || ""); return data; }, [api]);
  useEffect(() => {
    const controller = new AbortController();
    api("",null,controller.signal).then(data => {
      setWebsites(data.websites);
      setSiteId(current => data.websites.some(site => site.id===current) ? current : data.websites[0]?.id || "");
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [api]);
  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    api(`?site=${encodeURIComponent(siteId)}`,null,controller.signal).then(async data => {
      setHistory(data.history);setGoogle(data.google);setProperties(data.google.properties || []);setProperty(data.google.property || "");
      if (data.history[0]) {
        const value = await api(`?report=${data.history[0].id}`, null, controller.signal);
        if (!controller.signal.aborted) setReport(value.report);
      }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [siteId, api]);
  useEffect(() => {
    if (!siteId) return;
    const controller = new AbortController();
    const returned = event => {
      if (!event.persisted) return;
      // Browser Back may restore a cached pre-OAuth screen without remounting.
      setBusy(false);
      setGoogle(current => ({ ...current, connected: false, accessVerified: false, state: "checking" }));
      setProperties([]);
      reloadDetail(siteId, controller.signal).catch(failure => { if (!controller.signal.aborted) {
        setError(failure.message);
        setGoogle(current => ({ ...current, state: "google_unavailable", message: "Connection could not be checked. Retry without assuming access is available." }));
      } });
    };
    window.addEventListener("pageshow", returned);
    return () => { controller.abort(); window.removeEventListener("pageshow", returned); };
  }, [siteId, reloadDetail]);
  const reportId = report?.id, running = report?.status === "running";
  useEffect(() => {
    if (!reportId || !running || !auto || !canWrite) return;
    const controller = new AbortController();
    async function run() {
      try {
        while (!controller.signal.aborted) {
          const data = await api("", { action: "advance", report: reportId }, controller.signal);
          if (controller.signal.aborted) return;
          if (data.report.status !== "running") {
            // Refresh history before completing this effect. Publishing the
            // completed report first runs its cleanup and aborts these reads.
            try { await reloadDetail(siteId, controller.signal); await reloadSites(controller.signal); }
            finally { if (!controller.signal.aborted) setReport(data.report); }
            return;
          }
          setReport(data.report);
          await new Promise(resolve => {
            const done = () => { clearTimeout(timer); controller.signal.removeEventListener("abort", done); resolve(); };
            const timer = setTimeout(done, 1500); controller.signal.addEventListener("abort", done, { once: true });
          });
        }
      } catch (failure) { if (!controller.signal.aborted) { setError(failure.message); setAuto(false); } }
    }
    run(); return () => controller.abort();
  }, [reportId, running, auto, canWrite, siteId, reloadDetail, reloadSites, api]);
  function selectSite(id) {
    setDetailLoading(true);setReport(null);setHistory([]);setPrevious(null);setProperties([]);setGoogle(null);setError("");setSiteId(id);
  }
  async function action(input) {
    setBusy(true); setError("");
    try { return await api("", input); }
    catch (failure) { setError(failure.message); return null; }
    finally { setBusy(false); }
  }
  async function add(event) {
    event.preventDefault();
    const data = await action({ action: "add", ...Object.fromEntries(new FormData(event.currentTarget)) });
    if (data) { await reloadSites(); selectSite(data.website.id); setAdding(false); }
  }
  async function resumeReport() {
    const data = await action({ action:"advance",report:reportId,retry:true });
    if (data) { setReport(data.report); setAuto(true); }
  }
  async function analyze() { const data = await action({ action: "analyze", site: siteId }); if (data) { setReport(data.report); setPrevious(null); setAuto(true); setTab("overview"); } }
  async function connect() {
    setBusy(true); setError(""); setOauthResult(""); setProperties([]);
    setGoogle(current => ({ ...current, connected: false, accessVerified: false, state: "sign_in_incomplete",
      message: "Google sign-in has not completed. Any previous authorization is still saved and has not been replaced." }));
    try { const data = await api("/google", { site: siteId }); window.location.assign(data.url); }
    catch (failure) {
      setError(failure.message); setOauthResult("failed");
      try { await reloadDetail(siteId); }
      catch { setGoogle(current => ({ ...current, connected: false, accessVerified: false, state: "google_unavailable" })); }
      finally { setBusy(false); }
    }
  }
  async function checkGoogleAccess() {
    setBusy(true); setError(""); setOauthResult(""); setProperties([]);
    setGoogle(current => ({ ...current, connected: false, accessVerified: false, state: "checking" }));
    try { await reloadDetail(siteId); }
    catch (failure) { setError(failure.message); setGoogle(current => ({ ...current, state: "google_unavailable", message: "Connection could not be checked. Retry without assuming access is available." })); }
    finally { setBusy(false); }
  }
  async function openReport(id) {
    setBusy(true); setError("");
    try { const data = await api(`?report=${id}`); setReport(data.report); setPrevious(null); setTab("overview"); }
    catch (failure) { setError(failure.message); } finally { setBusy(false); }
  }
  async function compare(id) {
    setPrevious(null); if (!id) return;
    try { setPrevious((await api(`?report=${id}`)).report); } catch (failure) { setError(failure.message); }
  }
  const difference = previous && report?.status === "complete" ? compareReports(previous.result, result) : null;
  const findings = result?.findings || [];
  const filtered = findings.filter(item => (tab !== "geo" || item.category === "geo") && (category === "all" || item.category === category) && (severity === "all" || item.severity === severity));
  const samples = [...history].reverse().filter(item => item.status === "complete").map(item => ({ label: new Date(item.created_at).toLocaleDateString(),
    issues: (item.summary?.critical || 0) + (item.summary?.warnings || 0), clicks: item.search_summary?.clicks, impressions: item.search_summary?.impressions,
    position: item.search_summary?.position, mobile: item.performance?.mobile?.scores?.performance, desktop: item.performance?.desktop?.scores?.performance }));

  return <section className={styles.insights} aria-labelledby="website-insights-title">
    <header className={styles.heading}><div><p className={styles.eyebrow}>YOUR DIGITAL STOREFRONT, IN FOCUS</p><h1 id="website-insights-title">Website Insights</h1><p>Understand your website. Find the next useful improvement.</p></div>
      {canWrite && <button className={styles.primary} onClick={() => setAdding(!adding)} disabled={busy || running}>＋ Add website</button>}</header>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {oauthResult && <p role="status" className={styles.notice}>{["connected", "authorization_saved"].includes(oauthResult)
      ? "Google returned an authorization. Search Console access and a matching property still need verification below."
      : "The latest Google sign-in was cancelled or did not finish. No new account was connected; any earlier saved authorization was preserved."}</p>}
    {adding && <form onSubmit={add} className={styles.addForm}><label>Website name<input name="name" placeholder="My store" maxLength={120} required /></label><label>Website URL<input name="url" type="url" placeholder="https://your-store.com" maxLength={1000} required /></label><button className={styles.primary} disabled={busy}>Save website</button></form>}
    {loading ? <p role="status">Loading your websites…</p> : !websites.length ? <div className={styles.empty}><span className={styles.emptyIcon}>◎</span><h2>A clearer view starts with your website</h2><p>Add a public HTTPS website, then run a read-only analysis. No Google connection is required to get started.</p>{!canWrite && <p>Your role can read reports. Ask a client member or administrator to add a website.</p>}</div> : <>
      <div className={styles.siteBar}><label>Website<select value={siteId} onChange={event => selectSite(event.target.value)} disabled={busy}>{websites.map(site => <option key={site.id} value={site.id}>{site.name} · {new URL(site.url).hostname}</option>)}</select></label>
        <div className={styles.siteActions}>{canWrite && <button className={styles.secondary} disabled={busy || running || !selected} onClick={async () => {
          const name = window.prompt("Website display name", selected.name); if (!name) return;
          if (await action({ action: "rename", site: siteId, name })) await reloadSites();
        }}>Rename</button>}
        {canManage && <button className={styles.textButton} disabled={busy || running || !selected} onClick={async () => {
          if (!window.confirm("Archive this website and disconnect its Google access? Reports are retained in storage, not permanently deleted.")) return;
          if (await action({ action: "archive", site: siteId })) { const sites = await reloadSites(); selectSite(sites[0]?.id || ""); }
        }}>Archive</button>}
        {canWrite && <button className={styles.primary} disabled={busy || running || !selected} onClick={analyze}>Analyze Website ↗</button>}</div></div>
      {selected && <p className={styles.domain}><PageLink url={selected.url} /> <span>Public, read-only checks · No changes to your website</span></p>}
      <aside className={styles.googleBox}><div><strong>Google Search Console</strong><p role="status" aria-label="Google connection status">{connection.label}</p><p>{connection.message}</p></div>
        {canManage && <div className={styles.siteActions}>
          {connection.canCheck && <button className={styles.secondary} disabled={busy || running} onClick={checkGoogleAccess}>Check access again</button>}
          <button className={styles.secondary} disabled={busy || running || !google?.configured || google?.state === "checking"} onClick={connect}>{google?.state === "sign_in_incomplete" ? "Retry Google sign-in" : connection.hasAuthorization ? "Reconnect Google · read only" : "Connect Google · read only"}</button>
          {connection.hasAuthorization && <button className={styles.textButton} disabled={busy || running} onClick={async () => { if (await action({ action: "disconnect", site: siteId })) { setProperties([]); setOauthResult(""); await reloadDetail(siteId); } }}>{connection.ready ? "Disconnect" : "Remove saved authorization"}</button>}
        </div>}
        {canManage && connection.canSelectProperty && properties.length > 0 && <div className={styles.property}><label>Search Console property<select value={property} onChange={event => setProperty(event.target.value)}><option value="">Choose property</option>{properties.map(item => <option key={item.siteUrl}>{item.siteUrl}</option>)}</select></label><button className={styles.secondary} disabled={!property || busy || running} onClick={async () => { if (await action({ action: "select-property", site: siteId, property })) { setOauthResult(""); await reloadDetail(siteId); } }}>Use this property</button></div>}
        {connection.hasAuthorization && <small>Authorization saved: {date(google.connectedAt)}. A new sign-in replaces it only after authorization succeeds. Removing it here does not delete saved reports or revoke other Google integrations.</small>}
        <small>Only accessible Search Console properties matching this website can be selected. Google Analytics access alone is not enough.</small>
        <small>Connected Google reports are shared only with members of this client workspace. No write access to Search Console is requested.</small>
      </aside>
      {running && <div className={styles.progress} role="status"><div><strong>{stages[report.state.stage] || "Preparing analysis"}</strong><span>{result.pages.length} URLs checked · {result.coverage.limit}-URL sample limit. Each finished batch is saved.</span></div>
        {canWrite ? <button className={styles.secondary} onClick={() => { setError(""); if (auto) setAuto(false); else resumeReport(); }}>{auto ? "Pause" : "Resume"}</button> : <span>A member can resume this analysis.</span>}
        <progress max="6" value={({ discovery: 1, crawl: 2, mobile: 3, desktop: 4, search: 5 })[report.state.stage] || 1} /><small>{auto && canWrite ? "Runs while this view is open. Closing it pauses after the current request; saved work can be resumed." : "Analysis paused. Saved batches are retained."}</small></div>}
      {detailLoading ? <p role="status">Loading saved report…</p> : !report && !running ? <div className={styles.empty}><h2>Your first report starts here</h2><p>Analyze this website for real page findings and available Google performance results.</p>{canWrite && <button className={styles.primary} disabled={busy} onClick={analyze}>Run first analysis</button>}</div> : report && <>
        <div className={styles.reportBar}><div><strong>{report.status === "complete" ? "Website analysis" : "Analysis in progress"}</strong><small>{date(report.created_at)} · {report.status === "complete" ? "Saved report" : "Partial results; not a finished report"}</small></div>
          {report.status === "complete" && <div className={styles.siteActions}><a className={styles.secondary} href={`${API}?report=${report.id}&download=json`}>Download JSON</a><a className={styles.secondary} href={`${API}?report=${report.id}&download=csv`}>Findings CSV</a><button className={styles.secondary} onClick={() => window.print()}>Print / PDF</button></div>}</div>
        <nav className={styles.tabs} aria-label="Website report sections">{tabs.map(([value, label]) => <button key={value} onClick={() => { setTab(value); if (value === "geo") setCategory("all"); }} aria-current={tab === value ? "page" : undefined} className={tab === value ? styles.activeTab : ""}>{label}</button>)}</nav>
        {tab === "overview" && <><div className={styles.metrics}><Metric label="URLs checked" value={fmt(result.pages.length)} note={`${result.pages.filter(page => page.status === 200 && Array.isArray(page.h1)).length} HTML pages analyzed · bounded sample`} /><Metric label="Critical issues" value={report.status === "complete" ? fmt(result.summary?.critical) : "Pending"} /><Metric label="Warnings" value={report.status === "complete" ? fmt(result.summary?.warnings) : "Pending"} /><Metric label="Improvement opportunities" value={report.status === "complete" ? fmt(result.summary?.opportunities) : "Pending"} /></div>
          <div className={styles.notice}><strong>What this report can tell you</strong><p>{result.coverage.note}</p><p>{result.coverage.robots} {result.coverage.sitemap}</p>{result.coverage.robotsSkipped > 0 && <p>{result.coverage.robotsSkipped} discovered URLs skipped because of robots rules.</p>}
            <p>HTML signals can suggest discoverability issues, but do not confirm that Google indexed a page. Structured data is not proof of rich-result eligibility. GEO suggestions cannot guarantee visibility in ChatGPT, Gemini or Google AI results.</p></div>
          <h2>Start with these findings</h2><div className={styles.findingGrid}>{[...findings].sort((a, b) => ["critical", "warning", "opportunity"].indexOf(a.severity) - ["critical", "warning", "opportunity"].indexOf(b.severity)).slice(0, 4).map(item => <FindingCard key={item.id} item={item} />)}</div>
          {!findings.length && <p>{running ? "Findings will be assembled when all batches finish." : result.pages.length ? "No issues matched these checks on the sampled pages. This is not a clean bill of health for the whole website." : "No HTML pages could be checked. Review crawl access before drawing conclusions."}</p>}
          <div className={styles.chartGrid}><Trend title="Warnings & critical findings over time" rows={samples} field="issues" /><Trend title="Mobile lab performance over time" rows={samples} field="mobile" suffix=" / 100" /></div></>}
        {(tab === "findings" || tab === "geo") && <>{tab === "geo" && <p className={styles.notice}>Content-structure suggestions, not measured AI search visibility or guaranteed rankings.</p>}
          <div className={styles.filters}><label>Category<select value={category} onChange={event => setCategory(event.target.value)}><option value="all">All categories</option>{["seo", "accessibility", "performance", "geo"].map(value => <option key={value}>{value}</option>)}</select></label><label>Priority<select value={severity} onChange={event => setSeverity(event.target.value)}><option value="all">All priorities</option>{["critical", "warning", "opportunity"].map(value => <option key={value}>{value}</option>)}</select></label><span>{filtered.length} results</span></div>
          <div className={styles.findingGrid}>{filtered.map(item => <FindingCard key={item.id} item={item} />)}</div>{!filtered.length && <p>No matching findings in this report.</p>}</>}
        {tab === "search" && <SearchResults search={result.search} />}
        {tab === "performance" && <><p className={styles.notice}>Google PageSpeed tests the homepage, not every crawled page. Lighthouse is a lab snapshot; scores vary by test conditions. Field Core Web Vitals are shown only when Google returns actual CrUX URL data.</p>
          <div className={styles.chartGrid}>{["mobile", "desktop"].map(strategy => { const data = result.performance[strategy]; return <article className={styles.performance} key={strategy}><h2>{strategy === "mobile" ? "Mobile" : "Desktop"} homepage</h2>{data?.status === "available" ? <><div className={styles.metrics}>{Object.entries(data.scores).map(([label, value]) => <Metric key={label} label={label} value={value == null ? "Unavailable" : `${value}/100`} />)}</div><h3>Lab measurements</h3><dl>{Object.entries(data.lab).map(([name, value]) => <div key={name}><dt>{name.replaceAll("-", " ")}</dt><dd>{value.display}</dd></div>)}</dl><h3>Core Web Vitals · field data</h3>{data.field.metrics ? <dl>{Object.entries(data.field.metrics).map(([name, metric]) => <div key={name}><dt>{name.replaceAll("_", " ")}</dt><dd>{fmt(metric.percentile, 2)}{name === "CUMULATIVE_LAYOUT_SHIFT_SCORE" ? " (hundredths of CLS)" : name.endsWith("MS") ? " ms" : ""} · {metric.category}</dd></div>)}</dl> : <p>{data.field.message}</p>}<small>Measured: {date(data.fetchedAt)}</small></> : <p>{data?.message || "Not measured yet."}</p>}</article>; })}</div>
          <div className={styles.chartGrid}><Trend title="Mobile lab performance" rows={samples} field="mobile" /><Trend title="Desktop lab performance" rows={samples} field="desktop" /></div></>}
        {tab === "previews" && <><p className={styles.notice}>Illustrative Google-style previews, not actual search results. Google can rewrite titles and descriptions. Suggestions are never applied to your website automatically.</p>
          <div className={styles.previewGrid}>{result.pages.filter(page => page.status === 200).map(page => <article className={styles.preview} key={page.url}><small>{new URL(page.url).hostname}</small><div className={styles.pageUrl}><PageLink url={page.url} /></div><h3>{page.title || "Missing page title"}</h3><p>{page.description || "No meta description was found. Google may choose text from the page."}</p><details><summary>Draft title & description</summary><p><strong>Suggested title</strong><br />{page.suggestedTitle}</p><p><strong>Suggested description</strong><br />{page.suggestedDescription}</p><small>Template suggestion—review for accuracy, usefulness and your brand before using it.</small></details></article>)}</div></>}
        {tab === "history" && <><h2>Saved analyses</h2><p>Each completed analysis is saved automatically. The latest 60 analyses are listed; older reports remain stored. Existing snapshots keep their original dates and search periods.</p>
          <div className={styles.tableScroll}><table><thead><tr><th>Date</th><th>Status</th><th>Pages</th><th>Critical / warnings</th><th>Open</th></tr></thead><tbody>{history.map(item => <tr key={item.id}><td>{date(item.created_at)}</td><td>{item.status}</td><td>{fmt(item.summary?.pagesChecked)}</td><td>{fmt(item.summary?.critical)} / {fmt(item.summary?.warnings)}</td><td><button className={styles.secondary} disabled={busy} onClick={() => openReport(item.id)}>Open report</button></td></tr>)}</tbody></table></div>
          {report.status === "complete" && <label className={styles.compare}>Compare the open report with<select value={previous?.id || ""} onChange={event => compare(event.target.value)}><option value="">Choose another completed report</option>{history.filter(item => item.id !== report.id && item.status === "complete").map(item => <option key={item.id} value={item.id}>{date(item.created_at)}</option>)}</select></label>}
          {difference && <div className={styles.notice}><strong>{difference.newFindings.length} newly detected · {difference.noLongerDetected.length} no longer detected · {difference.commonPages} pages checked in both</strong><p>{difference.note}</p><ul>{difference.newFindings.slice(0, 15).map(item => <li key={item.id}>New: {item.title} — {item.page}</li>)}{difference.noLongerDetected.slice(0, 15).map(item => <li key={item.id}>No longer detected: {item.title} — {item.page}</li>)}</ul></div>}
          <div className={styles.chartGrid}><Trend title="Google clicks in saved 28-day periods" rows={samples} field="clicks" /><Trend title="Google impressions in saved 28-day periods" rows={samples} field="impressions" /><Trend title="Average Google position in saved periods (lower is better)" rows={samples} field="position" /><Trend title="Warnings & critical findings in sampled pages" rows={samples} field="issues" /></div></>}
      </>}
    </>}
  </section>;
}
