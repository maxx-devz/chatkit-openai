"use client";

import { ChatKit, useChatKit } from "@openai/chatkit-react";
import Script from "next/script";
import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_COUNT, UPLOAD_ACCEPT } from "@/lib/chatkit-uploads";
import styles from "./chatkit-assistant.module.css";

function conversationDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function ConversationSidebar({ activeId, onDelete, onNew, onRename, onSelect, onReload, state }) {
  const [editingId, setEditingId] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");

  function beginRename(conversation) {
    setEditingId(conversation.id);
    setTitle(conversation.title);
    setActionError("");
  }

  async function saveRename(event) {
    event.preventDefault();
    const nextTitle = title.trim();
    if (!editingId || !nextTitle || saving) return;
    setSaving(true);
    setActionError("");
    try {
      await onRename(editingId, nextTitle);
      setEditingId("");
    } catch (error) {
      setActionError(error.message || "The conversation could not be renamed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <aside className={styles.conversationSidebar} aria-label="Conversation history">
      <div className={styles.conversationHeader}>
        <div><span>Workspace</span><h3>Conversations</h3></div>
        <button type="button" onClick={onNew} aria-label="Start a new conversation" title="New conversation">+</button>
      </div>
      <div className={styles.conversationList}>
        {state.loading ? <p className={styles.conversationState}>Loading conversations...</p> : null}
        {state.error ? (
          <div className={styles.conversationState} role="alert">
            <span>{state.error}</span>
            <button type="button" onClick={onReload}>Try again</button>
          </div>
        ) : null}
        {!state.loading && !state.error && !state.items.length ? (
          <p className={styles.conversationState}>No saved conversations yet.</p>
        ) : null}
        {state.items.map((conversation) => (
          <div className={`${styles.conversationRow} ${conversation.id === activeId ? styles.activeConversation : ""}`} key={conversation.id}>
            {editingId === conversation.id ? (
              <form className={styles.renameForm} onSubmit={saveRename}>
                <input
                  autoFocus
                  maxLength={100}
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") setEditingId("");
                  }}
                  aria-label="Conversation name"
                />
                <button type="submit" disabled={saving || !title.trim()}>Save</button>
                <button type="button" onClick={() => setEditingId("")}>Cancel</button>
              </form>
            ) : (
              <>
                <button className={styles.conversationSelect} type="button" onClick={() => onSelect(conversation.id)}>
                  <strong>{conversation.title}</strong>
                  <small>{conversationDate(conversation.createdAt)}{conversation.messageCount ? ` - ${conversation.messageCount} items` : ""}</small>
                </button>
                <div className={styles.conversationActions}>
                  <button type="button" onClick={() => beginRename(conversation)} aria-label={`Rename ${conversation.title}`} title="Rename conversation">&#9998;</button>
                  <button type="button" onClick={() => onDelete(conversation)} aria-label={`Delete ${conversation.title}`} title="Delete conversation">&times;</button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
      {actionError ? <p className={styles.sidebarError} role="alert">{actionError}</p> : null}
      <p className={styles.conversationNote}>Saved privately to this client workspace.</p>
    </aside>
  );
}

function ClientLibrary({ onUseChat }) {
  const [state, setState] = useState({ loading: true, items: [], error: "" });
  const [showLink, setShowLink] = useState(false);
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/client-library", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The document library could not be loaded.");
      setState({ loading: false, items: data.items || [], error: "" });
    } catch (error) { setState((current) => ({ ...current, loading: false, error: error.message })); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function addLink(event) {
    event.preventDefault();
    setSaving(true);
    const form = new FormData(event.currentTarget);
    try {
      const response = await fetch("/api/client-library", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(form)), cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The link could not be saved.");
      event.currentTarget.reset();
      setShowLink(false);
      await load();
    } catch (error) { setState((current) => ({ ...current, error: error.message })); }
    finally { setSaving(false); }
  }
  async function remove(item) {
    if (!window.confirm(`Remove "${item.title}" from this client's library?`)) return;
    const response = await fetch("/api/client-library", { method: "DELETE", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: item.id }), cache: "no-store" });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setState((current) => ({ ...current, error: data.error || "The item could not be removed." }));
      return;
    }
    setState((current) => ({ ...current, items: current.items.filter((entry) => entry.id !== item.id), error: "" }));
  }
  return (
    <div className={styles.library}>
      <div className={styles.libraryIntro}>
        <div><h3>Client knowledge library</h3><p>Permanent files and reference links available across conversations.</p></div>
        <div className={styles.libraryActions}>
          <button type="button" onClick={onUseChat}>Attach in Chat</button>
          <button type="button" onClick={() => setShowLink((value) => !value)}>{showLink ? "Cancel" : "Add link"}</button>
        </div>
      </div>
      <p className={styles.libraryHint}>To store a file, attach it in Chat and say: <strong>Save this to the client library for 2026.</strong></p>
      {showLink && <form className={styles.linkForm} onSubmit={addLink}>
        <label>Title<input name="title" required maxLength={180} /></label>
        <label>HTTPS link<input name="url" type="url" required maxLength={1000} placeholder="https://..." /></label>
        <label className={styles.fullField}>Description<textarea name="description" maxLength={4000} rows={2} /></label>
        <label>Period starts<input name="periodStart" type="date" /></label>
        <label>Period ends<input name="periodEnd" type="date" /></label>
        <button type="submit" disabled={saving}>{saving ? "Saving..." : "Save reference"}</button>
      </form>}
      {state.error && <div className={styles.libraryError} role="alert">{state.error}</div>}
      {state.loading ? <div className={styles.state} role="status">Loading client library...</div>
        : !state.items.length ? <div className={styles.emptyLibrary}><strong>No permanent references yet</strong><span>Chat attachments remain in their conversation until you explicitly save them here.</span></div>
          : <ul className={styles.libraryList}>{state.items.map((item) => <li key={item.id}>
            <div className={styles.fileMark} aria-hidden="true">{item.type === "file" ? "F" : "L"}</div>
            <div className={styles.libraryCopy}>
              <strong>{item.title}</strong>
              <span>{item.filename || item.url}</span>
              <small>{item.periodStart || item.periodEnd ? `${item.periodStart || "Earlier"} to ${item.periodEnd || "present"}` : "No reporting period"}
                {item.type === "file" ? ` - ${item.indexStatus === "ready" ? "Searchable" : item.indexStatus === "not_applicable" ? "Saved; content is not searchable" : "Saved; indexing needs attention"}` : " - Reference link"}</small>
            </div>
            <div className={styles.itemActions}>
              {item.type === "file" ? <a href={item.downloadUrl}>Download</a> : <a href={item.url} target="_blank" rel="noreferrer">Open</a>}
              <button type="button" onClick={() => void remove(item)}>Remove</button>
            </div>
          </li>)}</ul>}
    </div>
  );
}

function ChatSurface({
  activeThreadId,
  appearance,
  clientId,
  clientName,
  domainKey,
  nonce,
  onConversationsChanged,
  onThreadChange,
  refreshAccess,
  threadSelectionVersion,
  uploadsEnabled,
}) {
  const [error, setError] = useState("");
  const [ready, setReady] = useState(false);
  const fetchChatKit = useCallback(async (input, init) => {
    const headers = new Headers(input instanceof Request ? input.headers : undefined);
    new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
    headers.set("x-aoc-client", clientId);
    const response = await fetch(input, { ...init, headers, credentials: "same-origin", cache: "no-store" });
    if (!response.ok) {
      const data = await response.clone().json().catch(() => ({}));
      setError(data.error || "The assistant could not connect. Please try again.");
      void refreshAccess();
    } else {
      setError("");
    }
    return response;
  }, [clientId, refreshAccess]);
  const { control, setThreadId } = useChatKit({
    api: { url: "/api/chatkit", domainKey, fetch: fetchChatKit,
      ...(uploadsEnabled ? { uploadStrategy: { type: "direct", uploadUrl: "/api/chatkit/upload" } } : {}) },
    theme: {
      colorScheme: "light", radius: "soft", density: "normal",
      color: { accent: { primary: appearance?.accent || "#1765ca", level: 2 } },
      typography: { baseSize: 14 },
    },
    frameTitle: `${clientName} AI assistant`,
    initialThread: activeThreadId,
    header: { enabled: false },
    history: { enabled: false, showDelete: false, showRename: false },
    startScreen: {
      greeting: appearance?.greeting || "What can we work on today?",
      prompts: appearance?.starters ? appearance.starters.map((prompt) => ({ label: prompt, prompt, icon: "sparkle" })) : [
        { label: "Plan my next steps", prompt: "Help me plan the next steps for my ecommerce project. Ask me what you need to know.", icon: "lightbulb" },
        { label: "Improve my store", prompt: "Help me identify ways to improve my online store. Start by asking about my goals.", icon: "sparkle" },
        { label: "Draft a message", prompt: "Help me write a clear message to the AOC team about my project.", icon: "write" },
      ],
    },
    composer: { placeholder: uploadsEnabled ? "Ask a question or attach a file…" : "Ask a question or share an idea…",
      attachments: { enabled: Boolean(uploadsEnabled), maxSize: MAX_UPLOAD_BYTES, maxCount: MAX_UPLOAD_COUNT, accept: UPLOAD_ACCEPT } },
    threadItemActions: { feedback: false, retry: true },
    widgets: { onAction: async (action) => {
      if (action.type === "download_file" && /^[0-9a-f-]{36}$/i.test(action.payload?.id || "")) {
        window.open(`/api/assistant-files/${action.payload.id}`, "_blank", "noopener,noreferrer");
      }
    } },
    onReady: () => { setReady(true); },
    onThreadChange: ({ threadId }) => {
      onThreadChange(threadId);
      void onConversationsChanged();
    },
    onResponseEnd: () => {
      void refreshAccess();
      void onConversationsChanged();
    },
    onError: () => { setError((previous) => previous || "Chat could not load or finish the request. Please try again."); },
  });
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setError("Chat is taking longer than expected to load. Check your connection and try again."), 20_000);
    return () => window.clearTimeout(timer);
  }, [ready]);
  useEffect(() => {
    if (!ready) return;
    void setThreadId(activeThreadId);
  }, [activeThreadId, ready, setThreadId, threadSelectionVersion]);
  return (
    <div className={styles.surface}>
      <Script
        src="https://cdn.platform.openai.com/deployments/chatkit/chatkit.js"
        strategy="afterInteractive"
        nonce={nonce}
        onError={() => setError("Chat could not load. Check your connection and refresh the page.")}
      />
      {error && <div className={styles.error} role="alert">{error}</div>}
      {!ready && <div className={styles.loading} role="status">Opening your assistant…</div>}
      <ChatKit control={control} className={styles.chat} />
    </div>
  );
}

export default function ChatKitAssistant({ clientId, clientName, domainKey, nonce, appearance }) {
  const [tab, setTab] = useState("chat");
  const [access, setAccess] = useState(null);
  const [accessError, setAccessError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [activeThreadId, setActiveThreadId] = useState(null);
  const [threadSelectionVersion, setThreadSelectionVersion] = useState(0);
  const [conversationState, setConversationState] = useState({ loading: true, items: [], error: "" });
  const accessRequest = useRef(null);
  const conversationRequest = useRef(null);
  const loadConversations = useCallback(async () => {
    if (conversationRequest.current) return conversationRequest.current;
    const request = (async () => {
      try {
        const response = await fetch("/api/conversations", { cache: "no-store" });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || "Conversation history could not be loaded.");
        setConversationState({ loading: false, items: data.conversations || [], error: "" });
      } catch (error) {
        setConversationState((current) => ({
          ...current,
          loading: false,
          error: error.message || "Conversation history could not be loaded.",
        }));
      } finally {
        if (conversationRequest.current === request) conversationRequest.current = null;
      }
    })();
    conversationRequest.current = request;
    return request;
  }, []);
  const refreshAccess = useCallback(async (signal) => {
    if (accessRequest.current) return accessRequest.current;
    const request = (async () => {
      try {
        const response = await fetch("/api/ai-access", { cache: "no-store", signal });
        if (!response.ok) throw new Error("Your assistant access could not be verified. Please refresh or sign in again.");
        const data = await response.json();
        if (!signal?.aborted) {
          setAccess(data.ai);
          setAccessError("");
        }
      } catch (error) {
        if (!signal?.aborted) setAccessError(error.message);
      } finally {
        if (accessRequest.current === request) accessRequest.current = null;
      }
    })();
    accessRequest.current = request;
    return request;
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    const refresh = () => { if (!document.hidden) void refreshAccess(controller.signal); };
    refresh();
    const timer = window.setInterval(refresh, 15_000);
    window.addEventListener("focus", refresh);
    return () => {
      controller.abort();
      window.clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [refreshAccess]);
  useEffect(() => {
    void loadConversations();
  }, [loadConversations]);

  function startNewConversation() {
    setActiveThreadId(null);
    setThreadSelectionVersion((value) => value + 1);
    setTab("chat");
  }

  function selectConversation(threadId) {
    setActiveThreadId(threadId);
    setThreadSelectionVersion((value) => value + 1);
    setTab("chat");
  }

  async function renameConversation(threadId, title) {
    const response = await fetch("/api/conversations", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: threadId, title }),
      cache: "no-store",
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || "The conversation could not be renamed.");
    setConversationState((current) => ({
      ...current,
      items: current.items.map((item) => (
        item.id === threadId ? { ...item, title: data.conversation.title } : item
      )),
      error: "",
    }));
  }

  async function deleteConversation(conversation) {
    if (!window.confirm(`Delete "${conversation.title}"? This conversation cannot be recovered.`)) return;
    const response = await fetch("/api/conversations", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: conversation.id }),
      cache: "no-store",
    });
    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      setConversationState((current) => ({ ...current, error: data.error || "The conversation could not be deleted." }));
      return;
    }
    setConversationState((current) => ({
      ...current,
      items: current.items.filter((item) => item.id !== conversation.id),
      error: "",
    }));
    if (activeThreadId === conversation.id) startNewConversation();
  }
  const blocked = accessError || (!access ? "Checking assistant access…"
    : !access.enabled ? "Your AI assistant is paused. Contact Always Open Commerce to resume access."
      : !domainKey ? "Your assistant is being set up. Please contact Always Open Commerce." : "");
  const allowanceLimit = Math.max(0, Number(access?.monthlyPromptLimit) || 0);
  const allowanceRemaining = Math.max(0, Number(access?.requestsRemaining) || 0);
  const allowancePercent = allowanceLimit
    ? Math.min(100, (allowanceRemaining / allowanceLimit) * 100)
    : 0;
  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Assistant conversations" onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const tabs = ["chat", "library"];
          const index = tabs.indexOf(tab);
          const next = event.key === "Home" ? tabs[0] : event.key === "End" ? tabs.at(-1)
            : tabs[(index + (event.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length];
          setTab(next);
          document.getElementById(`${next}-tab`)?.focus();
        }}>
          <button id="chat-tab" role="tab" tabIndex={tab === "chat" ? 0 : -1} aria-selected={tab === "chat"} aria-controls="assistant-chat" type="button" onClick={() => setTab("chat")}>Chat</button>
          <button id="library-tab" role="tab" tabIndex={tab === "library" ? 0 : -1} aria-selected={tab === "library"} aria-controls="assistant-library" type="button" onClick={() => setTab("library")}>Library</button>
        </div>
        <span className={styles.allowance}>
          <span>{access ? `${allowanceRemaining} requests left this month` : "Private workspace"}</span>
          {access && <i
            aria-label="Monthly AI requests remaining"
            aria-valuemax={allowanceLimit}
            aria-valuemin="0"
            aria-valuenow={allowanceRemaining}
            role="progressbar"
          ><b style={{ width: `${allowancePercent}%` }} /></i>}
        </span>
        {tab === "chat" && <button className={styles.reload} type="button" aria-label="Reconnect assistant" onClick={() => { setAttempt((value) => value + 1); void refreshAccess(); }}>Reconnect</button>}
      </div>
      <div id="assistant-chat" role="tabpanel" aria-labelledby="chat-tab" className={`${styles.content} ${styles.chatPanel}`} hidden={tab !== "chat"}>
        <ConversationSidebar
          activeId={activeThreadId}
          state={conversationState}
          onDelete={(conversation) => void deleteConversation(conversation)}
          onNew={startNewConversation}
          onReload={() => {
            setConversationState((current) => ({ ...current, loading: true, error: "" }));
            void loadConversations();
          }}
          onRename={renameConversation}
          onSelect={selectConversation}
        />
        <div className={styles.chatStage}>
          {blocked ? <div className={styles.state} role="status">{blocked}</div> : (
            <ChatSurface
              key={attempt}
              activeThreadId={activeThreadId}
              appearance={appearance}
              clientId={clientId}
              clientName={clientName}
              domainKey={domainKey}
              nonce={nonce}
              onConversationsChanged={loadConversations}
              onThreadChange={setActiveThreadId}
              refreshAccess={refreshAccess}
              threadSelectionVersion={threadSelectionVersion}
              uploadsEnabled={access.uploadsEnabled}
            />
          )}
        </div>
      </div>
      {tab === "library" && <div id="assistant-library" role="tabpanel" aria-labelledby="library-tab" className={styles.content}><ClientLibrary onUseChat={() => setTab("chat")} /></div>}
    </div>
  );
}
