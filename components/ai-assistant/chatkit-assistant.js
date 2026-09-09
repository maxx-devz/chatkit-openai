"use client";

import { ChatKit, useChatKit } from "@openai/chatkit-react";
import Script from "next/script";
import { useCallback, useEffect, useState } from "react";
import styles from "./chatkit-assistant.module.css";

function EarlierChats() {
  const [state, setState] = useState({ loading: true, threads: [], error: "" });
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/workspace", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error("Earlier conversations could not be loaded.");
        const data = await response.json();
        setState({ loading: false, threads: data.workspace?.threads || [], error: "" });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ loading: false, threads: [], error: error.message });
      });
    return () => controller.abort();
  }, []);
  if (state.loading) return <div className={styles.state} role="status">Loading earlier conversations…</div>;
  if (state.error) return <div className={styles.state} role="alert">{state.error}</div>;
  if (!state.threads.length) return <div className={styles.state}>No earlier conversations saved.</div>;
  const thread = state.threads.find((item) => item.id === selected);
  return (
    <div className={styles.archive}>
      <p className={styles.archiveNote}>Earlier conversations are available here to read. Start new conversations in Chat.</p>
      {thread ? (
        <>
          <button className={styles.back} type="button" onClick={() => setSelected(null)}>← All earlier conversations</button>
          <h3>{thread.title || "Conversation"}</h3>
          {thread.messages?.map((message, index) => (
            <article className={styles.message} key={message.id || index}>
              <strong>{message.role === "user" ? "You" : "Assistant"}</strong>
              <p>{message.content || (message.assets?.length ? "This message contains an image from the earlier assistant." : "No text saved.")}</p>
            </article>
          ))}
        </>
      ) : (
        <ul className={styles.threadList}>
          {[...state.threads].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).map((item) => (
            <li key={item.id}>
              <button type="button" onClick={() => setSelected(item.id)}>
                <strong>{item.title || "Conversation"}</strong>
                <span>{item.messages?.length || 0} messages</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ChatSurface({ clientId, clientName, domainKey, nonce, refreshAccess, appearance }) {
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
  const { control } = useChatKit({
    api: { url: "/api/chatkit", domainKey, fetch: fetchChatKit },
    theme: {
      colorScheme: "light", radius: "soft", density: "normal",
      color: { accent: { primary: appearance?.accent || "#1765ca", level: 2 } },
      typography: { baseSize: 14 },
    },
    frameTitle: `${clientName} AI assistant`,
    header: { title: { text: clientName } },
    history: { enabled: true, showDelete: true, showRename: true },
    startScreen: {
      greeting: appearance?.greeting || "What can we work on today?",
      prompts: appearance?.starters ? appearance.starters.map((prompt) => ({ label: prompt, prompt, icon: "sparkle" })) : [
        { label: "Plan my next steps", prompt: "Help me plan the next steps for my ecommerce project. Ask me what you need to know.", icon: "lightbulb" },
        { label: "Improve my store", prompt: "Help me identify ways to improve my online store. Start by asking about my goals.", icon: "sparkle" },
        { label: "Draft a message", prompt: "Help me write a clear message to the AOC team about my project.", icon: "write" },
      ],
    },
    composer: { placeholder: "Ask a question or share an idea…", attachments: { enabled: false } },
    threadItemActions: { feedback: false, retry: true },
    widgets: { onAction: async (action) => {
      if (action.type === "download_file" && /^[0-9a-f-]{36}$/i.test(action.payload?.id || "")) {
        window.open(`/api/assistant-files/${action.payload.id}`, "_blank", "noopener,noreferrer");
      }
    } },
    onReady: () => { setReady(true); },
    onResponseEnd: () => { void refreshAccess(); },
    onError: () => { setError((previous) => previous || "Chat could not load or finish the request. Please try again."); },
  });
  useEffect(() => {
    if (ready) return;
    const timer = window.setTimeout(() => setError("Chat is taking longer than expected to load. Check your connection and try again."), 20_000);
    return () => window.clearTimeout(timer);
  }, [ready]);
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
  const refreshAccess = useCallback(async (signal) => {
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
    }
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
  const blocked = accessError || (!access ? "Checking assistant access…"
    : !access.enabled ? "Your AI assistant is paused. Contact Always Open Commerce to resume access."
      : !domainKey ? "Your assistant is being set up. Please contact Always Open Commerce." : "");
  return (
    <div className={styles.root}>
      <div className={styles.toolbar}>
        <div className={styles.tabs} role="tablist" aria-label="Assistant conversations" onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = event.key === "Home" ? "chat" : event.key === "End" ? "archive" : tab === "chat" ? "archive" : "chat";
          setTab(next);
          document.getElementById(`${next}-tab`)?.focus();
        }}>
          <button id="chat-tab" role="tab" tabIndex={tab === "chat" ? 0 : -1} aria-selected={tab === "chat"} aria-controls="assistant-chat" type="button" onClick={() => setTab("chat")}>Chat</button>
          <button id="archive-tab" role="tab" tabIndex={tab === "archive" ? 0 : -1} aria-selected={tab === "archive"} aria-controls="assistant-archive" type="button" onClick={() => setTab("archive")}>Earlier chats</button>
        </div>
        <span className={styles.allowance}>
          {access ? `${access.requestsRemaining} requests left this month` : "Private workspace"}
        </span>
        {tab === "chat" && <button className={styles.reload} type="button" aria-label="Reconnect assistant" onClick={() => { setAttempt((value) => value + 1); void refreshAccess(); }}>Reconnect</button>}
      </div>
      <div id="assistant-chat" role="tabpanel" aria-labelledby="chat-tab" className={styles.content} hidden={tab !== "chat"}>
        {blocked ? <div className={styles.state} role="status">{blocked}</div> : (
          <ChatSurface key={attempt} clientId={clientId} clientName={clientName} domainKey={domainKey} nonce={nonce} refreshAccess={refreshAccess} appearance={appearance} />
        )}
      </div>
      {tab === "archive" && <div id="assistant-archive" role="tabpanel" aria-labelledby="archive-tab" className={styles.content}><EarlierChats /></div>}
    </div>
  );
}
