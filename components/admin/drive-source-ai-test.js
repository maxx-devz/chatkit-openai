"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./drive-sources.module.css";

const endpoint = "/api/admin/source-connections/test";

export default function DriveSourceAiTest({ files, rootName, previewedVersions, onPreview, sourceBusy }) {
  const [provider, setProvider] = useState(null);
  const [selected, setSelected] = useState([]);
  const [question, setQuestion] = useState("");
  const [consent, setConsent] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);
  const [mode, setMode] = useState("automatic");
  const request = useRef(null);
  const active = useRef(true);

  useEffect(() => {
    active.current = true;
    const controller = new AbortController();
    fetch(endpoint, { cache: "no-store", signal: controller.signal }).then(async response => {
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "AI test settings are unavailable.");
      if (active.current) setProvider(payload.provider);
    }).catch(failure => { if (active.current && !controller.signal.aborted) setError(failure.message); });
    return () => { active.current = false; controller.abort(); request.current?.abort(); };
  }, []);

  function changeSelection(next) {
    setSelected(next); setConsent(false); setResult(null); setError(""); setMessage("");
  }

  async function submit(event) {
    event.preventDefault();
    if (!provider || !consent || (mode === "manual" && !selected.length) || running || request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setRunning(true); setError(""); setMessage(""); setResult(null);
    try {
      const response = await fetch(endpoint, { method: "POST", cache: "no-store", referrerPolicy: "no-referrer",
        headers: { "Content-Type": "application/json" }, signal: controller.signal,
        body: JSON.stringify({ question, mode, ...(mode === "manual" ? { sources: selected } : {}), consent: true, provider: provider.id, model: provider.model }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "The private source test could not finish.");
      if (active.current && !controller.signal.aborted) setResult(payload);
    } catch (failure) {
      if (active.current) {
        if (controller.signal.aborted) setMessage("Test cancelled. No source was published. Provider processing already started may still incur charges.");
        else setError(failure.message);
      }
    } finally {
      request.current = null;
      if (active.current) { setRunning(false); setConsent(false); }
    }
  }

  const candidates = files.filter(file => file.previewSupported && /^\d{1,40}$/.test(file.version));
  return <section className={styles.card} aria-labelledby="source-test-heading">
    <p className={styles.eyebrow}>ADMINISTRATOR ONLY · NO CLIENT PUBLICATION</p>
    <h2 id="source-test-heading">Private AI source test</h2>
    <p>Automatic mode checks the configured parent before each answer, discovers new files and eligible source folders, and uses the current source guidance. No file selection or new links are needed. Unchanged document text is reused from a bounded private server-memory cache.</p>
    <p className={styles.small}>This remains a one-turn private simulation, separate from existing admin chat and client ChatKit. Automatic discovery is not client publication or production approval. The page checks folder metadata every minute while visible; it is not a 24/7 webhook service.</p>
    {provider && <p className={styles.providerInfo}>Destination: <strong>{provider.label}</strong> · <code>{provider.model}</code> · Uses your existing server-only provider connection.</p>}
    {!provider && !error && <p role="status">Loading AI provider settings…</p>}
    <form onSubmit={submit}>
      <fieldset disabled={running || Boolean(sourceBusy)} className={styles.testFieldset}>
        <legend>Source mode</legend>
        <div className={styles.sourceOptions}>
          <label><input type="radio" name="source-mode" checked={mode === "automatic"} onChange={() => { setMode("automatic"); changeSelection([]); }} /> Automatic parent sources</label>
          <label><input type="radio" name="source-mode" checked={mode === "manual"} onChange={() => { setMode("manual"); changeSelection([]); }} /> Advanced: select individual files</label>
        </div>
        {mode === "automatic" && <div className={styles.notice}>
          <strong>{rootName || "Configured parent"}: {candidates.length} readable Google Docs/Sheets, {files.length - candidates.length} unsupported files.</strong>
          <p>Every private test question rechecks current metadata and reads new/changed Google Docs and Sheets. Removed, archived, inaccessible or moved-out files are excluded. The model receives the current file directory and relevant excerpts, not an unbounded dump of all text.</p>
          <p>Source guidance applies only inside this private test and never overrides application security. Unsupported formats are listed but their contents are not read. No paid AI request happens merely because the folder changes.</p>
        </div>}
        {mode === "manual" && <>
        <p>Sources for this test ({selected.length}/3 selected)</p>
        <div className={styles.testSources}>{candidates.map(file => {
          const selection = selected.find(item => item.id === file.id);
          const reviewed = previewedVersions[file.id] === file.version;
          return <div key={file.id} className={styles.testSource}>
            <label className={styles.checkLabel}><input type="checkbox" checked={Boolean(selection)} disabled={!selection && selected.length >= 3}
              onChange={event => changeSelection(event.target.checked ? [...selected, { id: file.id, version: file.version, role: "reference" }] : selected.filter(item => item.id !== file.id))} />
              <span><strong>{file.name}</strong><small>Revision {file.version} · {file.modifiedTime ? new Date(file.modifiedTime).toLocaleString() : "No modification date"}</small></span></label>
            <div className={styles.sourceOptions}>
              <button type="button" className={styles.secondary} onClick={() => onPreview(file.id)} aria-label={"Preview " + file.name}>Preview</button>
              {selection && <label>Use as<select aria-label={"Source role for " + file.name} value={selection.role}
                onChange={event => changeSelection(selected.map(item => item.id === file.id ? { ...item, role: event.target.value } : item))}>
                <option value="reference">Reference facts only</option>
                <option value="instruction_simulation" disabled={!reviewed}>Reviewed instruction simulation</option>
              </select></label>}
            </div>
            {selection && !reviewed && <small>Open Private preview first to enable instruction simulation.</small>}
          </div>;
        })}</div>
        {!candidates.length && <p>No Google Docs or Sheets with valid revisions are available for testing.</p>}
        <p className={styles.small}>Instruction simulation applies only safe, relevant business/response rules from documents you have reviewed. Sources never override application security. Combined source text is limited to 200,000 characters; oversized selections are rejected, not truncated.</p>
        </>}
        <div className={styles.questionLabel}><label htmlFor="source-test-question">Test question</label><textarea id="source-test-question" required maxLength={4000} rows={4} value={question}
          placeholder="Ask about the current company sources, policies, or a newly added document."
          onChange={event => { setQuestion(event.target.value); setResult(null); }} /></div>
        <label className={styles.checkLabel}><input type="checkbox" checked={consent} disabled={!provider || (mode === "manual" && !selected.length)}
          onChange={event => setConsent(event.target.checked)} />
          <span>{mode === "automatic" ? "I authorize using current eligible sources under this parent for private instruction simulation, including newly added or changed files, and sending the current directory, relevant excerpts and this question to " : "I reviewed the selected revisions and authorize sending their full text and this question to "}{provider?.label || "the configured provider"} for this private test. Provider charges and data-handling policies apply.</span></label>
      </fieldset>
      <p className={styles.small}>The request disables API response storage (<code>store: false</code>); this does not guarantee zero provider retention. Text may be cached privately in server memory for up to 10 minutes between checks; restarts or serverless instances can require rereading. No source text or test conversations are saved to the portal database or browser storage. Aggregate token usage is recorded.</p>
      <div className={styles.actions}>
        <button type="submit" disabled={!provider || (mode === "manual" && !selected.length) || !question.trim() || !consent || running || Boolean(sourceBusy)}>{running ? "Checking sources and answering…" : "Run private AI test"}</button>
        {running && <button type="button" className={styles.secondary} onClick={() => request.current?.abort()}>Cancel test</button>}
      </div>
    </form>
    {running && <p role="status" className={styles.notice}>Validating source access and revisions, then waiting for the AI response…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {message && <p role="status" className={styles.notice}>{message}</p>}
    {result && <section aria-labelledby="source-test-result-heading" className={styles.testResult}>
      <h3 id="source-test-result-heading">Private test response</h3>
      <p className={styles.small}>{result.provider.label} · {result.provider.model} · {new Date(result.checkedAt).toLocaleString()} · Not published</p>
      {result.sync && <p className={styles.notice}>{result.sync.indexedDocuments} documents indexed · {result.sync.fetchedDocuments} fetched · {result.sync.reusedDocuments} reused · {result.sync.addedDocuments} added · {result.sync.removedDocuments} removed · {result.sync.contextDocuments} provided to AI · {result.sync.unsupportedFiles} unsupported. Folder checked {new Date(result.sync.checkedAt).toLocaleString()}.</p>}
      <div className={styles.testAnswer}>{result.answer}</div>
      {result.citationWarning && <p className={styles.notice}>{result.citationWarning}</p>}
      <h4>Source revisions provided to the model</h4>
      <p className={styles.small}>A citation links the response to a supplied source; it is not independent verification that the interpretation is correct.</p>
      <ul className={styles.testCitations}>{result.sources.map(source => <li key={source.id}>
        <a href={source.url} target="_blank" rel="noopener noreferrer">[{source.citation}] {source.name}</a>
        <span>Revision {source.version} · {source.role === "reference" ? "Reference" : "Instruction simulation"} · {source.cited ? "Cited in answer" : "Provided, not cited"}</span>
        <small>{source.coverage === "excerpts" ? "Relevant excerpts" : "Full text"}: {source.providedCharacters.toLocaleString()} of {source.originalCharacters.toLocaleString()} characters · Sent-content fingerprint: {source.contentHash}</small>
      </li>)}</ul>
    </section>}
  </section>;
}
