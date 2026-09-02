"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import aocIcon from "@/aoc-icon.png";
import styles from "./admin-assistant.module.css";

const STARTERS = [
  "Give me a concise operations summary for the selected client.",
  "What should I check before enabling a client's AI Assistant?",
  "Suggest a safe monthly usage policy for our client portal.",
];

const HISTORY_STORAGE_KEY = "aoc-admin-assistant-history-v1";
const MAX_HISTORY_SESSIONS = 30;
const MAX_HISTORY_MESSAGES = 40;
const PAUSED_RESPONSE_MESSAGE =
  "Response paused when you switched chats. Return here and choose Retry response to continue.";

function messageId() {
  return globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function sessionId() {
  return `admin-session-${messageId()}`;
}

function createSession(overrides = {}) {
  return {
    id: sessionId(),
    title: "New conversation",
    clientSlug: "",
    updatedAt: new Date().toISOString(),
    messages: [],
    ...overrides,
  };
}

function normalizeHistory(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_HISTORY_SESSIONS).flatMap((candidate) => {
    if (!candidate || typeof candidate !== "object") return [];
    const messages = Array.isArray(candidate.messages)
      ? candidate.messages.slice(-MAX_HISTORY_MESSAGES).flatMap((message) => {
          const interrupted = message?.role === "assistant"
            && (message?.paused === true
              || (typeof message?.errorMessage === "string" && message.errorMessage.trim()));
          if (
            (message?.role !== "user" && message?.role !== "assistant")
            || typeof message?.content !== "string"
            || (!message.content.trim() && !interrupted)
          ) return [];

          return [{
            id: typeof message.id === "string" ? message.id.slice(0, 100) : messageId(),
            role: message.role,
            content: message.content.slice(0, 12000),
            ...(message.paused === true ? { paused: true } : {}),
            ...(typeof message.errorMessage === "string" && message.errorMessage.trim()
              ? { errorMessage: message.errorMessage.trim().slice(0, 500) }
              : {}),
          }];
        })
      : [];
    const id = typeof candidate.id === "string" && candidate.id
      ? candidate.id.slice(0, 100)
      : sessionId();

    return [{
      id,
      title: typeof candidate.title === "string" && candidate.title.trim()
        ? candidate.title.trim().slice(0, 70)
        : "New conversation",
      clientSlug: typeof candidate.clientSlug === "string"
        ? candidate.clientSlug.slice(0, 50)
        : "",
      updatedAt: typeof candidate.updatedAt === "string"
        ? candidate.updatedAt
        : new Date().toISOString(),
      messages,
    }];
  });
}

function historyDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
}

function completedRequestHistory(messages) {
  const history = [];

  for (let index = 0; index + 1 < messages.length; index += 2) {
    const userMessage = messages[index];
    const assistantMessage = messages[index + 1];
    const userContent = typeof userMessage?.content === "string"
      ? userMessage.content.trim()
      : "";
    const assistantContent = typeof assistantMessage?.content === "string"
      ? assistantMessage.content.trim()
      : "";

    if (
      userMessage?.role !== "user"
      || assistantMessage?.role !== "assistant"
    ) {
      break;
    }

    // Interrupted or failed responses stay visible in the UI, but should not
    // be sent back to OpenAI as if they were completed answers.
    if (
      !userContent
      || !assistantContent
      || assistantMessage.pending
      || assistantMessage.paused
      || assistantMessage.errorMessage
    ) {
      continue;
    }

    history.push(
      { role: "user", content: userContent },
      { role: "assistant", content: assistantContent },
    );
  }

  return history;
}

function pauseMessages(messages, assistantMessageId) {
  return messages.map((message) => {
    if (message.id !== assistantMessageId) return message;

    const partial = typeof message.content === "string"
      ? message.content.trim()
      : "";
    return {
      ...message,
      content: partial
        ? `${partial}\n\n${PAUSED_RESPONSE_MESSAGE}`
        : PAUSED_RESPONSE_MESSAGE,
      pending: false,
      paused: true,
    };
  });
}

async function readJsonLines(response, onEvent) {
  if (!response.body) throw new Error("The server returned an empty response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line);
        onEvent(event);
        receivedDone ||= event.type === "done";
      }
      if (done) break;
    }
    if (buffer.trim()) {
      const event = JSON.parse(buffer);
      onEvent(event);
      receivedDone ||= event.type === "done";
    }
  } finally {
    if (!receivedDone) await reader.cancel().catch(() => {});
    reader.releaseLock();
  }

  if (!receivedDone) throw new Error("The response ended before it was complete.");
}

function labelForModel(model) {
  return model?.label || model?.id || "Configured model";
}

function AdminMessage({ message, onRetry }) {
  const isUser = message.role === "user";
  const canRetry = !isUser && !message.pending && (message.paused || message.errorMessage);

  return (
    <div className={`${styles.messageRow} ${isUser ? styles.userRow : styles.assistantRow}`}>
      {!isUser ? (
        <span className={styles.messageAvatar}>
          <Image src={aocIcon} alt="AOC" width={24} height={24} />
        </span>
      ) : null}
      <div className={styles.messageBubble}>
        <span className={styles.messageAuthor}>{isUser ? "You" : "AOC Admin Assistant"}</span>
        <p>{message.content || (message.pending ? "Thinking..." : "No response was received.")}</p>
        {canRetry ? (
          <div className={styles.interruptedMessage}>
            <span>{message.errorMessage ? "The response was incomplete." : "This response is paused."}</span>
            <button type="button" onClick={() => onRetry(message.id)} disabled={!onRetry}>
              Retry response
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default function AdminAssistant({ clients }) {
  const [messages, setMessages] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [historyReady, setHistoryReady] = useState(false);
  const [input, setInput] = useState("");
  const [clientSlug, setClientSlug] = useState("");
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsNotice, setModelsNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const activeRequestRef = useRef(null);

  const selectedClient = useMemo(
    () => clients.find((client) => client.slug === clientSlug) || null,
    [clients, clientSlug],
  );

  function persistHistory(nextSessions) {
    try {
      window.localStorage.setItem(
        HISTORY_STORAGE_KEY,
        JSON.stringify(nextSessions.slice(0, MAX_HISTORY_SESSIONS)),
      );
    } catch {
      // Browser storage may be disabled or full; the current session still works.
    }
  }

  useEffect(() => {
    let stored = [];
    try {
      stored = normalizeHistory(JSON.parse(window.localStorage.getItem(HISTORY_STORAGE_KEY) || "[]"));
    } catch {
      stored = [];
    }

    const nextSessions = stored.length ? stored : [createSession()];
    // Defer hydration updates until after the effect subscription is
    // established. This also avoids a synchronous cascading render under
    // React's hooks lint rules.
    queueMicrotask(() => {
      setSessions(nextSessions);
      setActiveSessionId(nextSessions[0].id);
      setMessages(nextSessions[0].messages);
      setClientSlug(nextSessions[0].clientSlug);
      setHistoryReady(true);
    });
  }, []);

  useEffect(() => {
    if (!historyReady || !activeSessionId) return;

    queueMicrotask(() => {
      setSessions((current) => {
        const updated = current.map((session) => {
          if (session.id !== activeSessionId) return session;
          const firstUserMessage = messages.find((message) => message.role === "user");
          return {
            ...session,
            title: firstUserMessage?.content?.trim().slice(0, 70) || "New conversation",
            clientSlug,
            messages: messages.slice(-MAX_HISTORY_MESSAGES),
            updatedAt: new Date().toISOString(),
          };
        });
        try {
          window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(updated.slice(0, MAX_HISTORY_SESSIONS)));
        } catch {
          // Browser storage may be disabled or full; the current session still works.
        }
        return updated;
      });
    });
  }, [activeSessionId, clientSlug, historyReady, messages]);

  useEffect(() => {
    let active = true;

    fetch("/api/admin/assistant", { cache: "no-store" })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || "Models could not be loaded.");
        return payload;
      })
      .then((payload) => {
        if (!active) return;
        const available = Array.isArray(payload?.models) ? payload.models : [];
        setModels(available);
        setSelectedModel(payload?.defaultModel || available[0]?.id || "");
        setModelsNotice(payload?.notice || "");
      })
      .catch((loadError) => {
        if (active) setModelsNotice(loadError.message || "Model list unavailable.");
      });

    return () => {
      active = false;
    };
  }, []);

  function chooseClient(value) {
    if (value === clientSlug) return;
    startNewSession(value);
  }

  function startNewSession(nextClientSlug = "") {
    cancelActiveRequest();
    const nextSession = createSession({ clientSlug: nextClientSlug });
    setSessions((current) => [nextSession, ...current].slice(0, MAX_HISTORY_SESSIONS));
    setActiveSessionId(nextSession.id);
    setClientSlug(nextClientSlug);
    setMessages([]);
    setError("");
  }

  function selectSession(session) {
    const pausedRequest = cancelActiveRequest();
    const nextMessages = pausedRequest?.sessionId === session.id
      ? pausedRequest.messages
      : session.messages || [];
    setActiveSessionId(session.id);
    setClientSlug(session.clientSlug || "");
    setMessages(nextMessages);
    setError("");
  }

  function deleteSession(sessionIdToDelete) {
    const target = sessions.find((session) => session.id === sessionIdToDelete);
    if (!target || !target.messages.length) return;

    const approved = window.confirm(
      `Delete “${target.title}”? This conversation cannot be recovered.`,
    );
    if (!approved) return;

    const pausedRequest = cancelActiveRequest();
    const remaining = sessions
      .filter((session) => session.id !== sessionIdToDelete)
      .map((session) => (
        pausedRequest?.sessionId === session.id && pausedRequest.messages
          ? { ...session, messages: pausedRequest.messages }
          : session
      ));
    const nextSessions = remaining.length ? remaining : [createSession({ clientSlug })];
    persistHistory(nextSessions);
    setSessions(nextSessions);

    if (sessionIdToDelete === activeSessionId) {
      setActiveSessionId(nextSessions[0].id);
      setMessages(nextSessions[0].messages);
      setClientSlug(nextSessions[0].clientSlug || "");
    }
    setError("");
  }

  function clearAdminHistory() {
    const savedCount = sessions.filter((session) => session.messages.length).length;
    if (!savedCount) return;

    const approved = window.confirm(
      `Delete all ${savedCount} saved admin conversation${savedCount === 1 ? "" : "s"}? This cannot be undone.`,
    );
    if (!approved) return;

    cancelActiveRequest();
    const nextSession = createSession({ clientSlug });
    persistHistory([nextSession]);
    setSessions([nextSession]);
    setActiveSessionId(nextSession.id);
    setMessages([]);
    setError("");
  }

  function cancelActiveRequest() {
    const activeRequest = activeRequestRef.current;
    if (!activeRequest) return;

    const pausedMessages = activeRequest.sessionId === activeSessionId
      ? pauseMessages(messages, activeRequest.assistantMessageId)
      : null;
    activeRequest.controller.abort();
    activeRequestRef.current = null;
    setBusy(false);
    if (pausedMessages) setMessages(pausedMessages);
    let nextSessions;
    setSessions((current) => {
      nextSessions = current.map((session) => (
        session.id === activeRequest.sessionId
          ? {
              ...session,
              messages: pauseMessages(session.messages, activeRequest.assistantMessageId),
              updatedAt: new Date().toISOString(),
            }
          : session
      ));
      persistHistory(nextSessions);
      return nextSessions;
    });

    return {
      sessionId: activeRequest.sessionId,
      messages: pausedMessages,
    };
  }

  function sendMessage(rawContent, { retryAssistantId = "" } = {}) {
    const content = rawContent.trim();
    if (!content || busy) return;

    const retryIndex = retryAssistantId
      ? messages.findIndex((message) => message.id === retryAssistantId)
      : -1;
    const retryUserMessage = retryIndex > 0 ? messages[retryIndex - 1] : null;
    const retrying = Boolean(
      retryUserMessage?.role === "user"
      && messages[retryIndex]?.role === "assistant"
      && (messages[retryIndex]?.paused || messages[retryIndex]?.errorMessage),
    );
    const baseMessages = retrying
      ? messages.filter((message) => message.id !== retryUserMessage.id && message.id !== retryAssistantId)
      : messages;
    const userMessage = { id: messageId(), role: "user", content };
    const assistantMessageId = messageId();
    const requestId = messageId();
    const controller = new AbortController();
    const requestMessages = [
      ...completedRequestHistory(baseMessages),
      { role: "user", content: userMessage.content },
    ];

    setInput("");
    setError("");
    setBusy(true);
    setMessages((current) => {
      const next = retrying
        ? current.filter((message) => message.id !== retryUserMessage.id && message.id !== retryAssistantId)
        : current;
      return [...next, userMessage, {
        id: assistantMessageId,
        role: "assistant",
        content: "",
        pending: true,
      }];
    });

    activeRequestRef.current = {
      id: requestId,
      controller,
      sessionId: activeSessionId,
      userMessageId: userMessage.id,
      assistantMessageId,
    };

    fetch("/api/admin/assistant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        messages: requestMessages,
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(clientSlug ? { clientSlug } : {}),
      }),
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          const diagnostic = payload?.diagnostic?.requestId
            ? ` (Request ID: ${payload.diagnostic.requestId})`
            : "";
          throw new Error(`${payload?.error || "The assistant could not respond."}${diagnostic}`);
        }
        return response;
      })
      .then(async (response) => {
        let receivedText = "";
        await readJsonLines(response, (event) => {
          if (activeRequestRef.current?.id !== requestId) return;
          if (event.type === "delta" && typeof event.delta === "string") {
            receivedText += event.delta;
            setMessages((current) => current.map((message) => (
              message.id === assistantMessageId
                ? { ...message, content: message.content + event.delta }
                : message
            )));
          }
          if (event.type === "error") {
            throw new Error(event.message || "The response stream failed.");
          }
          if (event.type === "done") {
            setMessages((current) => current.map((message) => (
              message.id === assistantMessageId
                ? { ...message, content: receivedText || "No response returned.", pending: false }
                : message
            )));
          }
        });
      })
      .catch((requestError) => {
        if (activeRequestRef.current?.id !== requestId) return;
        if (requestError.name === "AbortError") return;
        const message = requestError.message || "The assistant could not respond.";
        setMessages((current) => current.map((candidate) => (
          candidate.id === assistantMessageId
            ? {
                ...candidate,
                content: "",
                pending: false,
                errorMessage: message,
              }
            : candidate
        )));
        setError(message);
      })
      .finally(() => {
        if (activeRequestRef.current?.id !== requestId) return;
        activeRequestRef.current = null;
        setBusy(false);
      });
  }

  function retryMessage(assistantMessageId) {
    const index = messages.findIndex((message) => message.id === assistantMessageId);
    const previous = index > 0 ? messages[index - 1] : null;
    if (
      previous?.role !== "user"
      || messages[index]?.role !== "assistant"
      || (!messages[index]?.paused && !messages[index]?.errorMessage)
    ) return;

    setError("");
    sendMessage(previous.content, { retryAssistantId: assistantMessageId });
  }

  function submitMessage(event) {
    event.preventDefault();
    sendMessage(input);
  }

  return (
    <section className={styles.card} id="assistant" aria-labelledby="admin-assistant-title">
      <header className={styles.header}>
        <div className={styles.heading}>
          <span className={styles.headingIcon}>
            <Image src={aocIcon} alt="" width={30} height={30} />
          </span>
          <div>
            <p>Internal operations</p>
            <h2 id="admin-assistant-title">AOC Admin Assistant</h2>
            <span>Ask about portal operations, client controls, and approved knowledge.</span>
          </div>
        </div>
        <div className={styles.contextControls}>
          <label>
            <span>Client context</span>
            <select value={clientSlug} onChange={(event) => chooseClient(event.target.value)}>
              <option value="">All AOC operations</option>
              {clients.map((client) => (
                <option key={client.slug} value={client.slug}>{client.name}</option>
              ))}
            </select>
          </label>
          <label>
            <span>Model</span>
            <select
              value={selectedModel}
              onChange={(event) => setSelectedModel(event.target.value)}
              disabled={!models.length}
            >
              {models.length ? models.map((model) => (
                <option key={model.id} value={model.id}>{labelForModel(model)}</option>
              )) : <option value="">Loading models...</option>}
            </select>
          </label>
        </div>
      </header>

      {modelsNotice ? <p className={styles.notice}>{modelsNotice}</p> : null}

      <div className={styles.body}>
        <aside className={styles.history} aria-label="Previous admin conversations">
          <div className={styles.historyHeader}>
            <div><span>Workspace</span><h3>Conversations</h3></div>
            <div className={styles.historyActions}>
              <button
                className={styles.clearHistory}
                type="button"
                onClick={clearAdminHistory}
                disabled={!sessions.some((session) => session.messages.length)}
              >
                Clear
              </button>
              <button type="button" onClick={() => startNewSession(clientSlug)} aria-label="Start a new conversation">+</button>
            </div>
          </div>
          <div className={styles.historyList}>
            {sessions.map((session) => (
              <div
                className={session.id === activeSessionId ? styles.activeSession : ""}
                key={session.id}
              >
                <button type="button" onClick={() => selectSession(session)}>
                <strong>{session.title}</strong>
                <small>{session.clientSlug ? clients.find((client) => client.slug === session.clientSlug)?.name || session.clientSlug : "All AOC operations"} · {historyDate(session.updatedAt)}</small>
                </button>
                {session.messages.length ? (
                  <button
                    className={styles.deleteSession}
                    type="button"
                    onClick={() => deleteSession(session.id)}
                    aria-label={`Delete ${session.title}`}
                    title="Delete conversation"
                  >
                    ×
                  </button>
                ) : null}
              </div>
            ))}
            {!sessions.length ? <p className={styles.noHistory}>No previous conversations.</p> : null}
          </div>
          <p className={styles.historyNote}>Saved in this browser only.</p>
        </aside>

        <div className={styles.chatColumn}>
        <div className={styles.conversation} aria-live="polite">
          {!messages.length ? (
            <div className={styles.emptyState}>
              <span className={styles.emptyIcon}><Image src={aocIcon} alt="" width={42} height={42} /></span>
              <h3>What would you like to review?</h3>
              <p>
                {selectedClient
                  ? `You are asking with ${selectedClient.name}'s approved context.`
                  : "Use this private workspace for AOC-level operational questions."}
              </p>
              <div className={styles.starters}>
                {STARTERS.map((starter) => (
                  <button key={starter} type="button" onClick={() => setInput(starter)}>{starter}</button>
                ))}
              </div>
            </div>
          ) : messages.map((message) => (
            <AdminMessage
              key={message.id}
              message={message}
              onRetry={retryMessage}
            />
          ))}
        </div>

        {error ? <p className={styles.error} role="alert">{error}</p> : null}

        <form className={styles.composer} onSubmit={submitMessage}>
          <textarea
            value={input}
            maxLength={12000}
            rows={2}
            disabled={busy}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
            placeholder="Ask a private AOC operations question..."
          />
          <button type="submit" disabled={busy || !input.trim()}>
            {busy ? "Thinking..." : "Ask assistant"}
          </button>
        </form>
        <p className={styles.privacyNote}>Private admin session · Responses are not saved to a client workspace.</p>
        </div>
      </div>
    </section>
  );
}
