"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import SignOutButton from "@/components/auth/sign-out-button";
import styles from "./assistant-builder.module.css";

const SECTIONS = ["Instructions", "Knowledge", "Tools", "Appearance", "Versions"];
async function readResponse(response) {
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "The request could not be completed.");
  return data;
}

export default function AssistantBuilder({ initialData }) {
  const [state, setState] = useState(initialData.state);
  const [draft, setDraft] = useState(initialData.state?.draft);
  const [section, setSection] = useState("Instructions");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const transcript = useRef(null);
  const dirty = state && JSON.stringify(draft) !== JSON.stringify(state.draft);
  const unpublished = state && JSON.stringify(state.draft) !== JSON.stringify(state.live);
  useEffect(() => {
    if (!dirty) return;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  useEffect(() => { transcript.current?.scrollTo({ top: transcript.current.scrollHeight, behavior: "smooth" }); }, [messages, busy]);
  function apply(next) { setState(next); setDraft(next.draft); setMessages([]); }
  function edit(key, value) { setDraft((previous) => ({ ...previous, [key]: value })); setNotice(""); }
  async function selectClient(id) {
    if (dirty && !window.confirm("Discard unsaved changes and reload the selected client?")) return;
    setBusy("loading"); setError(""); setNotice("");
    try { const data = await fetch(`/api/builder?clientId=${encodeURIComponent(id)}`, { cache: "no-store" }).then(readResponse); apply(data.state); }
    catch (failure) { setError(failure.message); }
    finally { setBusy(""); }
  }
  async function save(action) {
    if (action === "reset" && !window.confirm("Replace this draft with the currently live settings?")) return;
    setBusy(action); setError(""); setNotice("");
    try {
      const data = await fetch("/api/builder", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: state.clientId, revision: state.revision, liveFingerprint: state.liveFingerprint, action, config: draft }) }).then(readResponse);
      apply(data.state);
      setNotice(action === "publish" ? `Version ${data.state.publishedVersion} is live for ${state.name}. New replies use these settings; reload the client page to update its appearance.`
        : action === "reset" ? "Draft reset to live settings." : "Draft saved. Test it before publishing.");
    } catch (failure) { setError(failure.message); }
    finally { setBusy(""); }
  }
  async function test(event) {
    event.preventDefault();
    if (!prompt.trim() || busy || dirty || !state.revision) return;
    const message = { role: "user", content: prompt.trim() };
    const previous = [...messages, message];
    const input = previous.slice(-11).map(({ role, content }) => ({ role, content }));
    while (input.length > 1 && input.reduce((sum, item) => sum + item.content.length, 0) > 30000) input.shift();
    setMessages(previous); setPrompt(""); setBusy("preview"); setError("");
    try {
      const result = await fetch("/api/builder/preview", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: state.clientId, revision: state.revision, messages: input }) }).then(readResponse);
      setMessages([...previous, { role: "assistant", content: result.text, files: result.files || [] }]);
    } catch (failure) { setError(failure.message); setMessages(messages); setPrompt(message.content); }
    finally { setBusy(""); }
  }

  return <main className={styles.page}>
    <header className={styles.topbar}>
      <div className={styles.brand}><span className={styles.mark}>AOC</span><div><strong>Assistant settings</strong><small>Private workspace</small></div></div>
      <nav aria-label="Workspace"><Link href="/admin">Administrator portal</Link><span>{initialData.admin.name}</span><SignOutButton /></nav>
    </header>
    <div className={styles.intro}><div><p className={styles.eyebrow}>CONFIGURE · TEST · PUBLISH</p><h1>Your assistant, your instructions.</h1><p>Shape what each client’s assistant knows, creates, and says.</p></div>
      <label className={styles.clientLabel}>Client<select value={state?.clientId || ""} disabled={Boolean(busy)} onChange={(event) => selectClient(event.target.value)}>
        {initialData.clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}
      </select></label></div>
    {!state ? <section className={styles.unavailable}><h2>No clients yet</h2><p>Create a client in the administrator portal to configure its assistant.</p></section> : <>
      <div className={styles.toolbar}><div><span className={styles.status}>{dirty ? "Unsaved changes" : unpublished ? "Draft changes" : "Matches live settings"}</span>
        <span>{state.publishedVersion ? `Live version ${state.publishedVersion}` : "Using existing client settings"}</span></div>
        <div><button disabled={Boolean(busy)} onClick={() => selectClient(state.clientId)}>Reload</button>
          <button disabled={Boolean(busy)} onClick={() => save("save")}>{busy === "save" ? "Saving…" : "Save draft"}</button>
          <button className={styles.primary} disabled={Boolean(busy) || dirty || !state.revision || state.conflict} onClick={() => save("publish")}>{busy === "publish" ? "Publishing…" : `Publish for ${state.name}`}</button></div></div>
      {error && <div className={styles.error} role="alert">{error}</div>}
      {notice && <div className={styles.notice} role="status">{notice}</div>}
      {state.conflict && <div className={styles.error}>Live settings changed outside this editor. Copy any draft text you want to keep, then <button disabled={Boolean(busy)} onClick={() => save("reset")}>Reset draft to live</button>.</div>}
      <div className={styles.workspace}>
        <section className={styles.editor} aria-label="Assistant settings">
          <div className={styles.tabs} role="tablist" aria-label="Settings sections">{SECTIONS.map((name) => <button key={name} role="tab" id={`tab-${name}`} aria-selected={section === name} aria-controls="settings-panel" onClick={() => setSection(name)}>{name}</button>)}</div>
          <fieldset disabled={Boolean(busy)} className={styles.fields} id="settings-panel" role="tabpanel" aria-labelledby={`tab-${section}`}>
            {section === "Instructions" && <><h2>Give the assistant a clear role</h2><p>Describe its purpose, tone, permitted topics, and how it should respond when information is missing.</p>
              <label>Approved instructions<textarea rows={14} maxLength={12000} value={draft.instructions} onChange={(event) => edit("instructions", event.target.value)} placeholder="You help this client create proposals using approved services. Ask for the audience and scope before drafting. Never invent prices or delivery dates." /></label>
              <small>{draft.instructions.length.toLocaleString()} / 12,000 characters. Company-wide instructions also apply.</small>
              <div className={styles.tip}>Try a specific request in the test chat before publishing. Describe expected behavior and check what happens when facts are missing.</div></>}
            {section === "Knowledge" && <><h2>Keep answers grounded</h2><p>Paste approved facts, FAQs, services, or brand guidance for this client. Draft material is used only in tests until you publish.</p>
              <label>Approved reference text<textarea rows={12} maxLength={16000} value={draft.knowledge} onChange={(event) => edit("knowledge", event.target.value)} placeholder="Services, product details, FAQs, approved brand colors…" /></label>
              <small>{draft.knowledge.length.toLocaleString()} / 16,000 characters</small>
              <label>Existing OpenAI knowledge store ID<input value={draft.vectorStoreId} maxLength={200} onChange={(event) => edit("vectorStoreId", event.target.value)} placeholder="vs_… (optional)" /></label>
              <p className={styles.help}>Connect a store containing only this client’s approved files. Manage those files in your OpenAI project; direct file uploads are not enabled in this editor.</p>
              <label className={styles.toggle}><input type="checkbox" checked={draft.fileSearch} onChange={(event) => edit("fileSearch", event.target.checked)} />Search the connected knowledge store</label></>}
            {section === "Tools" && <><h2>Choose what clients can create</h2><p>Tools become available to this client after publishing. Generated files are private to the person who requested them.</p>
              <div className={styles.tool}><label className={styles.toggle}><input type="checkbox" checked={draft.documents} onChange={(event) => edit("documents", event.target.checked)} /><strong>Word documents</strong><span className={styles.filetype}>DOCX</span></label><p>Create documents with titles, section headings, paragraphs, and bullet lists.</p>
                <label>Monthly document attempts<input type="number" min="1" max="500" value={draft.documentLimit} onChange={(event) => edit("documentLimit", Number(event.target.value))} /></label></div>
              <div className={styles.tool}><label className={styles.toggle}><input type="checkbox" checked={draft.images} onChange={(event) => edit("images", event.target.checked)} /><strong>Image generation</strong><span className={styles.filetype}>WEBP</span></label><p>Create 1024 × 1024 images using approved instructions. Image API charges apply.</p>
                <label>Monthly image attempts<input type="number" min="1" max="500" value={draft.imageLimit} onChange={(event) => edit("imageLimit", Number(event.target.value))} /></label></div>
              <small>Limits are shared across the client’s users and reset monthly in UTC. Attempts include failures. Up to two files per reply; 3 MB per file. The existing chat allowance also applies.</small>
              <div className={styles.tip}>Publishing approves these rules and tools. Clients can then download generated files immediately; there is no staff review queue for individual files.</div></>}
            {section === "Appearance" && <><h2>Welcome clients into the conversation</h2><p>Set the greeting, accent color, and suggested first messages shown in ChatKit.</p>
              <label>Greeting<input value={draft.greeting} maxLength={160} onChange={(event) => edit("greeting", event.target.value)} /></label>
              <label>Accent color<input type="color" value={draft.accent} onChange={(event) => edit("accent", event.target.value)} /></label>
              {[0, 1, 2].map((index) => <label key={index}>Starter prompt {index + 1}<input maxLength={200} value={draft.starters[index] || ""} onChange={(event) => { const starters = [...draft.starters]; while (starters.length <= index) starters.push(""); starters[index] = event.target.value; edit("starters", starters); }} /></label>)}</>}
            {section === "Versions" && <><h2>Published versions</h2><p>Restore a version into your draft, test it, then publish to make it live again.</p>
              {!state.history.length && <p>No versions published from the builder yet.</p>}
              {state.history.map((version) => <div className={styles.version} key={version.version}><div><strong>Version {version.version}</strong><small>{new Date(version.published_at).toLocaleString()}</small></div><button onClick={() => { setDraft(version.config); setNotice(`Version ${version.version} copied into the editor. Save and test before publishing.`); setSection("Instructions"); }}>Use as draft</button></div>)}
              <button onClick={() => save("reset")}>Reset draft to live settings</button></>}
          </fieldset>
        </section>
        <aside className={styles.preview} aria-label="Test assistant draft">
          <header><div><span className={styles.eyebrow}>TEST DRAFT</span><h2>{state.name}</h2></div><button disabled={Boolean(busy) || !messages.length} onClick={() => setMessages([])}>Clear chat</button></header>
          <p className={styles.previewNote}>Uses your saved draft and the same agent as client chat. Tests use API credits and a separate staff allowance of 20 replies per hour. Test downloads expire after 24 hours.</p>
          <div className={styles.transcript} ref={transcript} aria-live="polite" aria-busy={busy === "preview"}>
            {!messages.length && <div className={styles.welcome}><span className={styles.orb} style={{ background: draft.accent }}>✦</span><h3>{draft.greeting}</h3>
              {draft.starters.filter(Boolean).map((starter, index) => <button key={index} disabled={Boolean(busy)} onClick={() => setPrompt(starter)}>{starter}</button>)}</div>}
            {messages.map((message, index) => <article className={message.role === "user" ? styles.userMessage : styles.assistantMessage} key={index}><strong>{message.role === "user" ? "You" : "Assistant"}</strong><p>{message.content}</p>
              {message.files?.map((file) => <a className={styles.download} key={file.id} href={`/api/assistant-files/${file.id}?preview=1`} target="_blank" rel="noopener noreferrer">Download {file.filename} ↗</a>)}</article>)}
            {busy === "preview" && <p role="status" className={styles.thinking}>Working on your request…</p>}
          </div>
          <form className={styles.composer} onSubmit={test}><label className="sr-only" htmlFor="preview-message">Test message</label><textarea id="preview-message" value={prompt} maxLength={12000} rows={3} onChange={(event) => setPrompt(event.target.value)} disabled={Boolean(busy)} placeholder="Try a client request…" />
            <div><small>{dirty || !state.revision ? "Save your draft to test it." : "Preview conversations stay out of client history."}</small><button className={styles.primary} disabled={Boolean(busy) || dirty || !state.revision || !prompt.trim()} type="submit">{busy === "preview" ? "Testing…" : "Send"}</button></div></form>
        </aside>
      </div>
    </>}
  </main>;
}
