"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./provider-settings.module.css";

const names = { openai: "OpenAI", openrouter: "OpenRouter" };
const emptyDraft = () => ({ key: "", model: "", models: [], verified: false });

async function settingsRequest(method = "GET", body) {
  const response = await fetch("/api/admin/provider-settings", {
    method, cache: "no-store", headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Provider settings could not be loaded.");
  return data;
}

export default function ProviderSettings() {
  const [settings, setSettings] = useState(null);
  const [selected, setSelected] = useState("openai");
  const [drafts, setDrafts] = useState({ openai: emptyDraft(), openrouter: emptyDraft() });
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const mounted = useRef(false);

  useEffect(() => {
    mounted.current = true;
    settingsRequest().then((data) => {
      if (!mounted.current) return;
      setSettings(data);
      setSelected(data.activeProvider);
      setDrafts(Object.fromEntries(data.providers.map((item) => [item.id, { ...emptyDraft(), model: item.model }])));
    }).catch((failure) => { if (mounted.current) setError(failure.message); });
    return () => { mounted.current = false; };
  }, []);

  const saved = settings?.providers.find((item) => item.id === selected);
  const draft = drafts[selected];
  const active = settings?.providers.find((item) => item.id === settings.activeProvider);
  function updateDraft(values) {
    setDrafts((current) => ({ ...current, [selected]: { ...current[selected], ...values } }));
    setNotice(""); setError("");
  }
  async function loadModels() {
    setBusy("load"); setNotice(""); setError("");
    try {
      const catalog = await settingsRequest("POST", { provider: selected, apiKey: draft.key });
      if (!mounted.current) return;
      const allowed = catalog.models.filter((model) => model.supportsTools !== false);
      const model = allowed.some((item) => item.id === draft.model) ? draft.model
        : allowed.some((item) => item.id === catalog.defaultModel) ? catalog.defaultModel : allowed[0]?.id || "";
      setDrafts((current) => ({ ...current, [selected]: { ...current[selected], models: catalog.models, model, verified: true } }));
      setNotice(allowed.length ? "Key verified. Choose a model, then save to apply it across the portal."
        : "This provider returned no compatible tool-capable models.");
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) setBusy(""); }
  }
  async function save() {
    setBusy("save"); setNotice(""); setError("");
    try {
      const data = await settingsRequest("PUT", { provider: selected, apiKey: draft.key, model: draft.model });
      if (!mounted.current) return;
      setSettings(data);
      setDrafts((current) => ({ ...current, [selected]: { ...current[selected], key: "" } }));
      setNotice(`${names[selected]} saved and active. New admin, client, and preview replies use ${draft.model}.`);
      window.dispatchEvent(new Event("aoc:provider-settings-changed"));
      window.dispatchEvent(new Event("aoc:ai-usage-changed"));
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) setBusy(""); }
  }

  return <section className={styles.card} id="ai-provider-settings" aria-labelledby="provider-settings-title">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>One connection. Your entire workspace.</p>
        <h2 id="provider-settings-title">AI provider settings</h2>
        <p>Manage the provider and model used by every client, admin chat, and assistant preview.</p>
      </div>
      <span className={styles.badge}>{active?.configured ? `${names[active.id]} active` : "Setup required"}</span>
    </header>
    <div className={styles.body}>
      <div className={styles.providers} role="group" aria-label="AI provider">
        {Object.entries(names).map(([id, label]) => <button key={id} type="button"
          className={`${styles.provider} ${selected === id ? styles.selected : ""}`}
          aria-pressed={selected === id} disabled={Boolean(busy) || !settings}
          onClick={() => { setSelected(id); setError(""); setNotice(""); }}>
          <span className={styles.monogram}>{id === "openai" ? "AI" : "OR"}</span>
          <span><strong>{label}</strong><small>{id === "openai" ? "Direct OpenAI connection" : "Multiple model providers"}</small></span>
          <span className={styles.saved}>{settings?.providers.find((item) => item.id === id)?.configured ? "Key saved" : "Connect"}</span>
        </button>)}
      </div>
      <div className={styles.form}>
        <div className={styles.field}>
          <label htmlFor="provider-api-key">{names[selected]} API key</label>
          <div className={styles.inputRow}>
            <input id="provider-api-key" type="password" value={draft.key} autoComplete="new-password" spellCheck={false}
              disabled={Boolean(busy) || !settings?.ready} maxLength={512}
              placeholder={saved?.configured ? `Saved key ending ${saved.keySuffix} — leave blank to reuse` : selected === "openrouter" ? "sk-or-v1-…" : "sk-…"}
              onChange={(event) => updateDraft({ key: event.target.value.trim(), verified: false, models: [] })} />
            <button type="button" className={styles.secondary} onClick={loadModels}
              disabled={Boolean(busy) || !settings?.ready || (!draft.key && !saved?.configured)}>
              {busy === "load" ? "Checking…" : "Verify & load models"}
            </button>
          </div>
          <small>Saved keys are encrypted on the server, never returned to this page. Switching providers keeps both saved configurations.</small>
        </div>
        <div className={styles.field}>
          <label htmlFor="provider-model">Model for the entire portal</label>
          <select id="provider-model" value={draft.model} disabled={Boolean(busy) || !draft.verified}
            onChange={(event) => updateDraft({ model: event.target.value })}>
            {!draft.models.length && <option value={draft.model}>{draft.model || "Verify your key to load available models"}</option>}
            {draft.models.map((model) => <option key={model.id} value={model.id} disabled={model.supportsTools === false}>
              {model.label}{model.supportsTools === false ? " — no tool support" : ""}
            </option>)}
          </select>
          <small>Model access, free-tier limits, and billing are controlled by your provider. A listed model is not a guarantee of capacity.</small>
        </div>
      </div>
      {settings && !settings.ready && <p role="alert" className={styles.error}>{settings.setupMessage}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      <footer className={styles.actions}>
        <p>{active?.configured ? <>Currently using <strong>{active.model}</strong></> : "No saved provider connection yet."}<br />Existing replies are not interrupted when you switch.</p>
        <button type="button" className={styles.primary} onClick={save}
          disabled={Boolean(busy) || !draft.verified || !draft.model || !settings?.ready}>
          {busy === "save" ? "Saving…" : `Save & activate ${names[selected]}`}
        </button>
      </footer>
      <aside className={styles.database}>
        <span className={styles.dot} aria-hidden="true" />
        <div><strong>Database · {settings?.database.connected ? "Connected" : "Checking connection"}</strong>
          <p>Managed in deployment settings. DATABASE_URL is needed before admin login; changing it here cannot safely move existing clients or conversations. Keep it and PROVIDER_SETTINGS_SECRET on both servers.</p></div>
      </aside>
    </div>
  </section>;
}
