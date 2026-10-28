"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./drive-sources.module.css";

const empty = { enabled: false, referencePaths: [], instructionIds: [], additionalInstructions: "", generalReferences: false };
const sharedEmpty = { ...empty, referencePaths: [""], generalReferences: true };
const audienceKey = item => item.audience === "clients" ? "clients" : (item.clientId || "admin");

export default function PreparedSourceSettings({ connected, onPreview }) {
  const [status, setStatus] = useState(null);
  const [audience, setAudience] = useState("clients");
  const [form, setForm] = useState(sharedEmpty);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const inFlight = useRef(false);
  const initialized = useRef(false);

  const request = useCallback(async (body, signal) => {
    const response = await fetch("/api/admin/source-connections/prepared", { cache: "no-store", signal,
      ...(body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : {}) });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || "Prepared sources are unavailable.");
    return payload;
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    request(null, controller.signal).then(payload => {
      setStatus(payload);
      if (!initialized.current) {
        setForm(payload.publications.find(item => audienceKey(item) === "clients") || sharedEmpty);
        initialized.current = true;
      }
    }).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [request, connected]);

  useEffect(() => {
    if (!connected) return;
    let active = true;
    let controller;
    const refresh = async () => {
      if (document.hidden || inFlight.current) return;
      inFlight.current = true;
      controller = new AbortController();
      setBusy("sync");
      try {
        const payload = await request({ action: "sync" }, controller.signal);
        if (active) { setStatus(payload); setError(""); }
      } catch (failure) { if (active && !controller.signal.aborted) setError(failure.message); }
      finally { inFlight.current = false; if (active) setBusy(""); }
    };
    refresh();
    const timer = setInterval(refresh, 60_000);
    const visible = () => { if (!document.hidden) refresh(); };
    document.addEventListener("visibilitychange", visible);
    return () => { active = false; controller?.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", visible); };
  }, [connected, request]);

  const chooseAudience = value => {
    setAudience(value); setConsent(false); setNotice("");
    setForm(status?.publications.find(item => audienceKey(item) === value) || (value === "clients" ? sharedEmpty : empty));
  };
  const toggle = (key, value) => setForm(previous => ({ ...previous,
    [key]: previous[key].includes(value) ? previous[key].filter(item => item !== value) : [...previous[key], value] }));

  async function action(kind) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(kind); setError(""); setNotice("");
    try {
      const payload = await request(kind === "sync" ? { action: kind } : kind === "disable"
        ? { action: kind, clientId: audience === "admin" ? null : audience }
        : { action: "save", clientId: audience === "admin" ? null : audience, consent,
          enabled: form.enabled, referencePaths: form.referencePaths, instructionIds: form.instructionIds,
          additionalInstructions: form.additionalInstructions, generalReferences: form.generalReferences });
      setStatus(payload);
      if (kind !== "sync") { setForm(payload.publications.find(item => audienceKey(item) === audience) || (audience === "clients" ? sharedEmpty : empty)); setConsent(false); }
      setNotice(kind === "sync" ? "Source preparation finished. Chat messages do not scan Drive."
        : kind === "disable" ? "Prepared-source use is paused for this audience."
          : form.enabled ? "Approved sources and separate instructions are enabled for this audience." : "Settings saved with source use disabled.");
    } catch (failure) { setError(failure.message); }
    finally { inFlight.current = false; setBusy(""); }
  }

  const instructionCharacters = (status?.documents || []).filter(doc => form.instructionIds.includes(doc.id)).reduce((sum, doc) => sum + doc.characters, 0);
  const automaticParent = audience === "clients" && form.referencePaths.includes("");
  return <section className={styles.card} aria-labelledby="prepared-heading">
    <div className={styles.heading}><div><p className={styles.eyebrow}>PREPARE ONCE · RETRIEVE WHEN NEEDED</p>
      <h2 id="prepared-heading">Company knowledge &amp; AI instructions</h2></div>
      <span className={styles.badge}>{status?.ready ? "Prepared sources ready" : "Sources need preparation"}</span></div>
    <p>Client ChatKit and your private AOC Admin assistant can use an encrypted, database-backed source cache. No OpenAI file upload, vector-store service or additional AI call is used for syncing. Existing provider usage still applies when chatting.</p>
    <p>Connect Google once as AOC Admin, then publish a shared company pack below. All current and future clients inherit it automatically. Clients only type in their chatbox: no Google login, Drive permissions or repeated uploads are needed.</p>
    <p className={styles.small}>This page synchronizes every minute while visible. For continuous updates when closed, run <code>npm run sources:watch</code> locally or configure the protected production scheduler. Sources older than 15 minutes, disconnected sources and failed syncs are blocked rather than silently treated as current.</p>
    <div className={styles.providerInfo} role="status">{busy === "sync" ? "Checking source revisions and preparing changed documents…" : status?.ready
      ? `${status.sync.indexedDocuments || 0} documents prepared · ${status.sync.unsupportedFiles || 0} unsupported files · checked ${new Date(status.checkedAt).toLocaleString()}`
      : "Synchronize sources before enabling them in chat."}</div>
    <div className={styles.actions}><button type="button" disabled={Boolean(busy) || !connected} onClick={() => action("sync")}>Synchronize now</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <fieldset className={styles.testFieldset} disabled={Boolean(busy) && busy !== "sync"}>
      <legend>Publish once for all clients</legend>
      <label className={styles.search} htmlFor="prepared-source-audience">Apply settings to<select id="prepared-source-audience" value={audience} onChange={event => chooseAudience(event.target.value)}>
        <option value="clients">All clients + AOC Admin — shared company knowledge</option>
        <option value="admin">My private AOC Admin AI — optional extra sources</option>
        {(status?.clients || []).map(client => <option key={client.id} value={client.id}>{client.name} · optional client-only extras</option>)}
      </select></label>
      <p className={styles.small}>Shared instructions apply in both client chat modes and AOC Admin. Reference access in General chat is controlled below. Individual client settings are optional extras, not required setup. Pausing extras does not disable shared guidance. Read-only access prevents edits, not disclosure: select only content approved for every client. Keep private company records in the private admin audience.</p>
      {audience === "clients" && status?.sharedManagedElsewhere && <p className={styles.notice} role="status">Another administrator owns the shared pack ({status.sharedEnabled ? "enabled" : "paused"}). Sign in as its publisher to update it; this account cannot replace it.</p>}
      {audience === "clients" && <div className={styles.providerInfo}>
        <label className={styles.checkLabel}><input type="checkbox" checked={automaticParent} onChange={event => {
          setForm(previous => ({ ...previous, referencePaths: event.target.checked ? [""] : [], instructionIds: [] }));
          setConsent(false);
        }} />Use the configured Company Knowledge parent automatically (recommended)</label>
        <p className={styles.small}>All supported current and future files in the configured parent are prepared automatically, excluding archived/legacy material and shortcuts. No document or folder selection is needed. Each question retrieves relevant company guidance and facts from the index instead of sending every file. Original files stay unchanged; missing evidence and retrieval limits must be acknowledged.</p>
        {automaticParent && <p className={styles.small}>Automatic mode has no 10,000-character full-document instruction selection: large guides are searchable in passages. General ingestion, freshness and per-request context limits still apply. This is retrieval, not a guarantee that every rule in every file is read on each answer.</p>}
      </div>}
      {!automaticParent && <>
      <details><summary>Reference folders · automatically include new eligible documents</summary>
        <div className={styles.testSources}>
          {audience === "admin" && <label className={styles.testSource}><span className={styles.checkLabel}><input type="checkbox" checked={form.referencePaths.includes("")} onChange={() => toggle("referencePaths", "")} />Entire eligible parent collection · private AOC Admin only</span></label>}
          {(status?.folders || []).map(folder => <label className={styles.testSource} key={folder.id}><span className={styles.checkLabel}><input type="checkbox" checked={form.referencePaths.includes(folder.id)} onChange={() => toggle("referencePaths", folder.id)} />{folder.path} · {folder.id.slice(-6)}</span></label>)}
        </div>
      </details>
      <details><summary>Mandatory business-instruction documents · {instructionCharacters.toLocaleString()} / 10,000 characters</summary>
        <p className={styles.small}>Choose only reviewed instruction documents. Their current text is included on every answer in both modes, not selected by keyword search. Future edits to these explicitly approved documents apply after sync. Other files never become mandatory rules automatically.</p>
        <div className={styles.testSources}>{(status?.documents || []).map(doc => <div className={styles.testSource} key={doc.id}>
          <label className={styles.checkLabel}><input type="checkbox" checked={form.instructionIds.includes(doc.id)} onChange={() => toggle("instructionIds", doc.id)} /><span>{doc.name}<small>{doc.characters.toLocaleString()} characters · revision {doc.version}</small></span></label>
          <button type="button" className={styles.secondary} onClick={() => onPreview(doc.id)}>Review source</button>
        </div>)}</div>
      </details>
      </>}
      <label className={styles.questionLabel}>Additional instructions · separate from Drive
        <textarea rows={5} maxLength={4000} value={form.additionalInstructions} onChange={event => setForm({ ...form, additionalInstructions: event.target.value })}
          placeholder="Optional audience-specific guidance. This never edits the original Drive files." /></label>
      <p className={styles.small}>These supplement existing portal/client instructions. Application security always wins; mandatory approved source rules take precedence over conflicting additional guidance.</p>
      <label className={styles.checkLabel}><input type="checkbox" checked={form.generalReferences} onChange={event => setForm({ ...form, generalReferences: event.target.checked })} />Allow relevant prepared reference excerpts in General chat too. General chat still does not fetch Hubstaff data.</label>
      <label className={styles.checkLabel}><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} />Enable these prepared sources and additional instructions for the selected audience</label>
      <label className={styles.checkLabel}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I approve {automaticParent ? "the configured Company Knowledge parent and its eligible current and future files" : "the selected instructions and reference content"} {audience === "clients" ? "for ALL current and future clients and AOC Admin" : "for this audience"}, including future source edits and new eligible files inside approved reference folders. Relevant content will be processed by the configured AI provider.</label>
      <div className={styles.actions}><button type="button" disabled={Boolean(busy) || !status?.ready || (form.enabled && !consent) || instructionCharacters > 10_000 || (audience === "clients" && status?.sharedManagedElsewhere)} onClick={() => action("save")}>{audience === "clients" ? "Save shared company pack" : "Save optional audience settings"}</button>
        <button type="button" disabled={Boolean(busy) || (audience === "clients" && status?.sharedManagedElsewhere)} className={styles.secondary} onClick={() => action("disable")}>Pause source use</button></div>
    </fieldset>
  </section>;
}
