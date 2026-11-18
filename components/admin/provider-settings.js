"use client";

import { useEffect, useRef, useState } from "react";
import { selectedProviderModel } from "../../lib/provider-configuration.js";
import { modelBlocked, modelAvailabilityLabel } from "../../lib/model-availability.js";
import { modelReasoningEfforts } from "../../lib/provider-generation-options.js";
import { isOpenRouterFreeModel, visibleProviderModels } from "../../lib/openrouter-setup.js";
import styles from "./provider-settings.module.css";

const names = { openai: "OpenAI", openrouter: "OpenRouter" };
const emptyDraft = () => ({ key: "", model: "", reasoningEffort: "auto", models: [], verified: false, catalogProvider: "",
  freeOnly: true, query: "", account: null });

async function settingsRequest(method = "GET", body) {
  const response = await fetch("/api/admin/provider-settings", {
    method, cache: "no-store", headers: { "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || "Provider settings could not be loaded.");
    error.modelAvailability = data.modelAvailability;
    throw error;
  }
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
      setDrafts(Object.fromEntries(data.providers.map((item) => [item.id, { ...emptyDraft(), model: item.model,
        freeOnly: !item.model || isOpenRouterFreeModel(item.model),
        reasoningEffort: item.generationOptions?.reasoningEffort || "auto" }])));
    }).catch((failure) => { if (mounted.current) setError(failure.message); });
    return () => { mounted.current = false; };
  }, []);

  const saved = settings?.providers.find((item) => item.id === selected);
  const draft = drafts[selected];
  const active = settings?.providers.find((item) => item.id === settings.activeProvider);
  const selectedModel = draft.models.find((model) => model.id === draft.model);
  const effortOptions = modelReasoningEfforts(selected, selectedModel);
  const visibleModels = visibleProviderModels(draft.models, { freeOnly: selected === "openrouter" && draft.freeOnly, query: draft.query });
  const eligibleFree = draft.models.filter(model => model.free && !modelBlocked(model) && model.id !== "openrouter/free");
  function updateDraft(values) {
    setDrafts((current) => ({ ...current, [selected]: { ...current[selected], ...values } }));
    setNotice(""); setError("");
  }
  async function loadModels() {
    setBusy("load"); setNotice(""); setError("");
    try {
      const catalog = await settingsRequest("POST", { provider: selected, apiKey: draft.key });
      if (!mounted.current) return;
      if (!catalog.verified || catalog.provider !== selected || !Array.isArray(catalog.models)) {
        throw new Error("The provider did not return a verified model list. Please retry.");
      }
      const allowed = catalog.models.filter((model) => !modelBlocked(model) && (selected !== "openrouter" || !draft.freeOnly || model.free));
      const model = allowed.some((item) => item.id === draft.model) ? draft.model
        : allowed.some((item) => item.id === catalog.defaultModel) ? catalog.defaultModel : allowed[0]?.id || "";
      const efforts = modelReasoningEfforts(selected, catalog.models.find(item => item.id === model));
      setDrafts((current) => ({ ...current, [selected]: { ...current[selected], models: catalog.models, model,
        reasoningEffort: efforts.includes(current[selected].reasoningEffort) ? current[selected].reasoningEffort : "auto",
        verified: true, catalogProvider: catalog.provider, account: catalog.account || null } }));
      setNotice(allowed.length ? "Models loaded. Choose a model and save. No generation test is required."
        : "No eligible models were returned for this key. Check account permissions, routing settings and model availability.");
    } catch (failure) { if (mounted.current) setError(failure.message); }
    finally { if (mounted.current) setBusy(""); }
  }
  async function save() {
    setBusy("save"); setNotice(""); setError("");
    try {
      const modelId = selectedProviderModel(selected, draft);
      const data = await settingsRequest("PUT", { provider: selected, apiKey: draft.key, model: modelId,
        generationOptions: { reasoningEffort: draft.reasoningEffort } });
      if (!mounted.current) return;
      const confirmed = data.providers.find((item) => item.id === selected);
      if (data.activeProvider !== selected || confirmed?.model !== modelId || data.activation?.id !== modelId
        || data.activation?.provider !== selected || confirmed.generationOptions?.reasoningEffort !== draft.reasoningEffort) {
        throw new Error("The server did not confirm this model as active. Reload settings before retrying.");
      }
      setSettings(data);
      setDrafts((current) => ({ ...current, [selected]: { ...current[selected], key: "", account: data.account || null } }));
      setNotice(`${names[selected]} configuration saved: ${confirmed.model}. Connection metadata checked; a chat reply has not been tested.`);
      window.dispatchEvent(new Event("aoc:provider-settings-changed"));
      window.dispatchEvent(new Event("aoc:ai-usage-changed"));
    } catch (failure) {
      if (mounted.current) {
        setError(failure.message);
        const blocked = failure.modelAvailability;
        if (blocked?.provider === selected && blocked.id === draft.model) {
          setDrafts(current => ({ ...current, [selected]: { ...current[selected],
            models: current[selected].models.map(model => model.id === blocked.id ? { ...model, availability: blocked.availability } : model) } }));
        }
      }
    }
    finally { if (mounted.current) setBusy(""); }
  }

  return <section className={styles.card} id="ai-provider-settings" aria-labelledby="provider-settings-title">
    <header className={styles.header}>
      <div><p className={styles.eyebrow}>One connection. Your entire workspace.</p>
        <h2 id="provider-settings-title">AI provider settings</h2>
        <p>Choose OpenAI or OpenRouter, then a model for client chat and AOC Admin. Other model providers are available through OpenRouter.</p>
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
              onChange={(event) => updateDraft({ key: event.target.value.trim(), verified: false, models: [], catalogProvider: "", account: null })} />
            <button type="button" className={styles.secondary} onClick={loadModels}
              disabled={Boolean(busy) || !settings?.ready || (!draft.key && !saved?.configured)}>
              {busy === "load" ? "Checking…" : "Verify & load models"}
            </button>
          </div>
          <small>Saved keys are encrypted on the server, never returned to this page. Switching providers keeps both saved configurations.</small>
        </div>
        {selected === "openrouter" && <aside className={styles.setup} aria-label="OpenRouter setup">
          <strong>OpenRouter setup · key → model → save</strong>
          <p>Use a free model for no-cost text generation. Free does not mean unlimited, and some free providers may retain prompts or use them for training.</p>
          {draft.account && <p role="status"><strong>Key accepted · {draft.account.isFreeTier === true ? "Free-tier account" : draft.account.isFreeTier === false ? "Previously funded account" : "Account checked"}</strong><br />
            {draft.account.freeRequests.remaining !== null && draft.account.freeRequests.limit !== null
              ? `${draft.account.freeRequests.remaining} / ${draft.account.freeRequests.limit} free requests remaining today (UTC; shared across this OpenRouter account).`
              : "The provider did not report a remaining free-request count."}
            {draft.account.freeRequests.remaining === 0 && " Daily allowance reached. Wait for the provider's reset."}
            <br />Checked at {new Date(draft.account.checkedAt).toLocaleTimeString()}. Refresh to update; this is not a live chat test.
          </p>}
          <details><summary>Privacy / routing error? Start here</summary>
            <p>A valid key and an available quota do not guarantee a route. OpenRouter can return 404 when privacy, ZDR, guardrails or provider restrictions exclude every endpoint.</p>
            <p>Review <a href="https://openrouter.ai/settings/privacy" target="_blank" rel="noopener noreferrer">OpenRouter privacy settings</a> and your key/workspace restrictions, then refresh the models here.
              Prefer a specific allowed free model over the random Free Router if that router fails. Do not relax company privacy requirements just to enable a free model.</p>
            <p>This portal never changes those account policies or silently switches to a paid model. Metadata checks do not test generation.</p>
          </details>
        </aside>}
        <div className={styles.field}>
          <label htmlFor="provider-model">Model for the entire portal</label>
          {selected === "openrouter" && <div className={styles.modelFilters}>
            <label className={styles.check}><input type="checkbox" checked={draft.freeOnly} disabled={Boolean(busy)}
              onChange={event => updateDraft({ freeOnly: event.target.checked })} /> Show free models only</label>
            <input aria-label="Find an OpenRouter model" placeholder="Find model by name or ID" value={draft.query}
              disabled={Boolean(busy)} onChange={event => updateDraft({ query: event.target.value })} />
          </div>}
          <select id="provider-model" value={draft.model} disabled={Boolean(busy) || !draft.verified}
            onChange={(event) => updateDraft({ model: event.target.value, reasoningEffort: "auto" })}>
            {!draft.models.length && <option value={draft.model}>{draft.model ? `${draft.model} (saved ID; verify to reload)` : "Verify your key to load available models"}</option>}
            {draft.models.length > 0 && !visibleModels.some(model => model.id === draft.model) && <option value={draft.model} disabled>
              {draft.model ? `${draft.model} (selected; hidden by filter)` : "No matching model — adjust the filter"}
            </option>}
            {visibleModels.map((model) => <option key={model.id} value={model.id} disabled={modelBlocked(model)}>
              {model.id}{selected === "openrouter" ? model.free ? " · Free" : model.zeroPriced ? " · Zero-priced; credits may be required" : " · Paid / price varies" : ""}{modelBlocked(model) ? " · Unavailable" : ""}
            </option>)}
          </select>
          {draft.model && <small>Exact API model ID: <code>{draft.model}</code>. Only the ID is sent, not the display name.</small>}
          {selectedModel && <small role="status">{modelAvailabilityLabel(selectedModel)}</small>}
          {selected === "openrouter" && <small>{eligibleFree.length} specific free model(s) listed with tool support and account permission.
            {draft.model === "openrouter/free" && " Free Router randomly selects a model; its routes and privacy compatibility can change between replies."}
            {selectedModel?.contextLength > 0 && ` Context window: ${selectedModel.contextLength.toLocaleString()} tokens.`}
            {draft.freeOnly && selectedModel && !selectedModel.free && " The selected model is not free. Choose a free model before saving if you want free inference."}
          </small>}
          {selected === "openrouter" && selectedModel?.free && <small>Free-model inference has a zero-price routing limit. Separately enabled image/file tools may still have their own costs.</small>}
          <small>Retired, account-restricted or tool-incompatible models remain disabled. Temporary rate limits do not lock model selection.
            A model listing does not confirm credits or quota.</small>
        </div>
        {effortOptions.length > 1 && <div className={styles.field}>
          <label htmlFor="provider-reasoning">Reasoning effort</label>
          <select id="provider-reasoning" value={effortOptions.includes(draft.reasoningEffort) ? draft.reasoningEffort : "auto"}
            disabled={Boolean(busy) || !draft.verified || effortOptions.length === 1}
            onChange={event => updateDraft({ reasoningEffort: event.target.value })}>
            {effortOptions.map(value => <option key={value} value={value}>
              {({ auto: "Auto — model default", low: "Low — faster, lighter reasoning", medium: "Medium — balanced", high: "High — deeper reasoning" })[value]}
            </option>)}
          </select>
          <small>{effortOptions.length > 1 ? "Higher effort can take longer and use more tokens. This does not change API credits or rate limits."
            : "This model uses its provider defaults."}</small>
        </div>}
      </div>
      {settings && !settings.ready && <p role="alert" className={styles.error}>{settings.setupMessage}</p>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {notice && <p role="status" className={styles.notice}>{notice}</p>}
      <footer className={styles.actions}>
        <p>{active?.configured ? <>Currently using <strong>{active.model}</strong></> : "No saved provider connection yet."}<br />Existing replies are not interrupted when you switch.</p>
        <button type="button" className={styles.primary} onClick={save}
          disabled={Boolean(busy) || !draft.verified || !draft.model || !settings?.ready || modelBlocked(selectedModel)
            || (selected === "openrouter" && draft.freeOnly && !selectedModel?.free)}>
          {busy === "save" ? "Saving…" : `Save & activate ${names[selected]}`}
        </button>
      </footer>
      <p className={styles.testDisclosure}>Saving verifies the key and model list only; it does not generate a reply or consume generation tokens.
        This is connection/model verification, not a billing-capacity check. Actual chat requests use your provider&apos;s API credits or free-model allowance. ChatGPT plan access is separate from API billing.</p>
      <aside className={styles.database}>
        <span className={styles.dot} aria-hidden="true" />
        <div><strong>Database · {settings?.database.connected ? "Connected" : "Checking connection"}</strong>
          <p>Managed in deployment settings. DATABASE_URL is needed before admin login; changing it here cannot safely move existing clients or conversations. Keep it and PROVIDER_SETTINGS_SECRET on both servers.</p></div>
      </aside>
    </div>
  </section>;
}
