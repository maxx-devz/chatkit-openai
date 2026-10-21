"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./drive-sources.module.css";

const empty = { enabled: false, referencePaths: [], instructionIds: [], additionalInstructions: "", generalReferences: false };

export default function PreparedSourceSettings({ connected, onPreview }) {
  const [status, setStatus] = useState(null);
  const [audience, setAudience] = useState("admin");
  const [form, setForm] = useState(empty);
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
        setForm(payload.publications.find(item => item.clientId === null) || empty);
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
    setForm(status?.publications.find(item => (item.clientId || "admin") === value) || empty);
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
      if (kind !== "sync") { setForm(payload.publications.find(item => (item.clientId || "admin") === audience) || empty); setConsent(false); }
      setNotice(kind === "sync" ? "Source preparation finished. Chat messages do not scan Drive."
        : kind === "disable" ? "Prepared-source use is paused for this audience."
          : form.enabled ? "Approved sources and separate instructions are enabled for this audience." : "Settings saved with source use disabled.");
    } catch (failure) { setError(failure.message); }
    finally { inFlight.current = false; setBusy(""); }
  }

  const instructionCharacters = (status?.documents || []).filter(doc => form.instructionIds.includes(doc.id)).reduce((sum, doc) => sum + doc.characters, 0);
  return <section className={styles.card} aria-labelledby="prepared-heading">
    <div className={styles.heading}><div><p className={styles.eyebrow}>PREPARE ONCE · RETRIEVE WHEN NEEDED</p>
      <h2 id="prepared-heading">Chat sources &amp; additional instructions</h2></div>
      <span className={styles.badge}>{status?.ready ? "Prepared sources ready" : "Sources need preparation"}</span></div>
    <p>Client ChatKit and your private AOC Admin assistant can use an encrypted, database-backed source cache. No OpenAI file upload, vector-store service or additional AI call is used for syncing. Existing provider usage still applies when chatting.</p>
    <p className={styles.small}>This page synchronizes every minute while visible. For continuous updates when closed, run <code>npm run sources:watch</code> locally or configure the protected production scheduler. Sources older than 15 minutes, disconnected sources and failed syncs are blocked rather than silently treated as current.</p>
    <div className={styles.providerInfo} role="status">{busy === "sync" ? "Checking source revisions and preparing changed documents…" : status?.ready
      ? `${status.sync.indexedDocuments || 0} documents prepared · ${status.sync.unsupportedFiles || 0} unsupported files · checked ${new Date(status.checkedAt).toLocaleString()}`
      : "Synchronize sources before enabling them in chat."}</div>
    <div className={styles.actions}><button type="button" disabled={Boolean(busy) || !connected} onClick={() => action("sync")}>Synchronize now</button></div>
    {error && <p className={styles.error} role="alert">{error}</p>}
    {notice && <p className={styles.notice} role="status">{notice}</p>}
    <fieldset className={styles.testFieldset} disabled={Boolean(busy) && busy !== "sync"}>
      <legend>Audience-specific approval</legend>
      <label className={styles.search} htmlFor="prepared-source-audience">Apply settings to<select id="prepared-source-audience" value={audience} onChange={event => chooseAudience(event.target.value)}>
        <option value="admin">My private AOC Admin AI</option>
        {(status?.clients || []).map(client => <option key={client.id} value={client.id}>{client.name} · client AI</option>)}
      </select></label>
      <p className={styles.small}>Read-only Drive access prevents edits, not disclosure. Client content must be approved for that specific client. Nothing is enabled by default; the complete parent collection is available only to your private AOC Admin AI.</p>
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
      <label className={styles.questionLabel}>Additional instructions · separate from Drive
        <textarea rows={5} maxLength={4000} value={form.additionalInstructions} onChange={event => setForm({ ...form, additionalInstructions: event.target.value })}
          placeholder="Optional audience-specific guidance. This never edits the original Drive files." /></label>
      <p className={styles.small}>These supplement existing portal/client instructions. Application security always wins; mandatory approved source rules take precedence over conflicting additional guidance.</p>
      <label className={styles.checkLabel}><input type="checkbox" checked={form.generalReferences} onChange={event => setForm({ ...form, generalReferences: event.target.checked })} />Allow relevant prepared reference excerpts in General chat too. General chat still does not fetch Hubstaff data.</label>
      <label className={styles.checkLabel}><input type="checkbox" checked={form.enabled} onChange={event => setForm({ ...form, enabled: event.target.checked })} />Enable these prepared sources and additional instructions for the selected audience</label>
      <label className={styles.checkLabel}><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} />I approve the selected instructions and reference content for this audience, including future source edits and new eligible files inside approved reference folders. Relevant content will be processed by the configured AI provider.</label>
      <div className={styles.actions}><button type="button" disabled={Boolean(busy) || !status?.ready || (form.enabled && !consent) || instructionCharacters > 10_000} onClick={() => action("save")}>Save audience settings</button>
        <button type="button" disabled={Boolean(busy)} className={styles.secondary} onClick={() => action("disable")}>Pause source use</button></div>
    </fieldset>
  </section>;
}
