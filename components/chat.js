"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import aocIcon from "@/aoc-icon.png";

const MAX_INPUT_LENGTH = 12000;
const MAX_HISTORY_MESSAGES = 30;

function createMessage(role, content = "") {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id: `message-${randomId}`,
    role,
    content,
    status: role === "assistant" ? "streaming" : "completed",
  };
}

async function readJsonLines(response, onEvent) {
  if (!response.body) {
    throw new Error("The server returned an empty response.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });

      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

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
    if (!receivedDone) {
      await reader.cancel().catch(() => {});
    }
    reader.releaseLock();
  }

  if (!receivedDone) {
    throw new Error("The response ended before it was complete.");
  }
}

function canBranchAt(messages, index) {
  return messages
    .slice(0, index + 1)
    .every(
      (message) =>
        message.role === "user" || message.status === "completed",
    );
}

export default function Chat({
  starters,
  messages,
  onMessagesChange,
  onNewConversation,
  onBranch,
  conversationTitle,
  folderName,
  autoFocusComposer,
}) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [assistantAnnouncement, setAssistantAnnouncement] = useState("");
  const abortRef = useRef(null);
  const sendingRef = useRef(false);
  const endRef = useRef(null);
  const textAreaRef = useRef(null);
  const headingRef = useRef(null);

  const isStreaming = status === "streaming";

  useEffect(() => {
    if (autoFocusComposer) textAreaRef.current?.focus();
    else headingRef.current?.focus();
  }, [autoFocusComposer]);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    endRef.current?.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "end",
    });
  }, [messages]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  function updateAssistant(id, update) {
    onMessagesChange((current) =>
      current.map((message) =>
        message.id === id
          ? {
              ...message,
              ...(typeof update === "function" ? update(message) : update),
            }
          : message,
      ),
    );
  }

  async function sendMessage(text) {
    const content = text.trim();
    if (!content || sendingRef.current) return;

    if (
      messages.some(
        (message) =>
          message.role === "assistant" && message.status !== "completed",
      )
    ) {
      setError(
        "This chat contains an incomplete response. Start a new chat or branch from an earlier completed response.",
      );
      return;
    }

    if (messages.length >= MAX_HISTORY_MESSAGES) {
      setError(
        "This chat reached the prototype history limit. Branch from an earlier response or start a new chat.",
      );
      return;
    }

    sendingRef.current = true;

    const userMessage = createMessage("user", content);
    const assistantMessage = createMessage("assistant");
    const requestMessages = [...messages, userMessage].map(
      ({ role, content: messageContent }) => ({
        role,
        content: messageContent,
      }),
    );

    setInput("");
    setError("");
    setStatus("streaming");
    setAssistantAnnouncement("Assistant is responding.");
    onMessagesChange((current) => [
      ...current,
      userMessage,
      assistantMessage,
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    let receivedContent = "";

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: requestMessages }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw new Error(payload?.error || "The assistant could not respond.");
      }

      await readJsonLines(response, (event) => {
        if (event.type === "delta") {
          receivedContent += event.delta;
          updateAssistant(assistantMessage.id, (message) => ({
            content: message.content + event.delta,
          }));
        }

        if (event.type === "error") {
          throw new Error(event.message || "The response stream failed.");
        }
      });

      if (!receivedContent.trim()) {
        throw new Error("The assistant returned an empty response.");
      }

      updateAssistant(assistantMessage.id, { status: "completed" });
      setAssistantAnnouncement("Response complete.");
    } catch (requestError) {
      const stopped = requestError.name === "AbortError";
      setError(stopped ? "Response stopped." : requestError.message || "Something went wrong.");
      setAssistantAnnouncement(
        stopped ? "Response stopped." : "Response incomplete.",
      );

      if (!receivedContent.trim()) setInput(content);

      onMessagesChange((current) => {
        const assistant = current.find(
          (message) => message.id === assistantMessage.id,
        );

        if (assistant?.content.trim()) {
          return current.map((message) =>
            message.id === assistantMessage.id
              ? { ...message, status: stopped ? "stopped" : "failed" }
              : message,
          );
        }

        return current.filter(
          (message) =>
            message.id !== assistantMessage.id && message.id !== userMessage.id,
        );
      });
    } finally {
      if (abortRef.current === controller) {
        abortRef.current = null;
        sendingRef.current = false;
        setStatus("idle");
        textAreaRef.current?.focus();
      }
    }
  }

  function handleSubmit(event) {
    event.preventDefault();
    sendMessage(input);
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage(input);
    }
  }

  function newConversation() {
    abortRef.current?.abort();
    onNewConversation();
  }

  return (
    <div className="chat" aria-busy={isStreaming}>
      <div className="conversation-toolbar">
        <div className="conversation-heading" ref={headingRef} tabIndex={-1}>
          <p title={conversationTitle}>{conversationTitle}</p>
          <span>{folderName}</span>
        </div>
        <button
          className="new-chat-button"
          type="button"
          onClick={newConversation}
        >
          New chat
        </button>
      </div>

      <div
        className="messages"
        role="log"
        aria-live="off"
      >
        {messages.length === 0 ? (
          <div className="welcome-state">
            <div className="assistant-avatar large" aria-hidden="true">
              <Image className="aoc-avatar-icon" src={aocIcon} alt="" />
            </div>
            <h2>How can I help today?</h2>
            <p>
              Ask a question about your project, website, or work with Always
              Open Commerce.
            </p>
            <div className="starter-grid">
              {starters.map((starter) => (
                <button
                  key={starter}
                  type="button"
                  onClick={() => sendMessage(starter)}
                >
                  {starter}
                  <span aria-hidden="true">&rarr;</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <article className={`message ${message.role}`} key={message.id}>
              <div className="message-avatar" aria-hidden="true">
                {message.role === "assistant" ? (
                  <Image className="aoc-avatar-icon" src={aocIcon} alt="" />
                ) : (
                  "You"
                )}
              </div>
              <div className="message-content">
                <strong>
                  {message.role === "assistant" ? "AOC Assistant" : "You"}
                </strong>
                {message.content ? (
                  <p>{message.content}</p>
                ) : message.status === "streaming" ? (
                  <span className="typing-indicator" aria-label="Thinking">
                    <i />
                    <i />
                    <i />
                  </span>
                ) : (
                  <p className="empty-response">No response was received.</p>
                )}
                {message.role === "assistant" && message.status === "stopped" ? (
                  <span className="message-status">Response stopped</span>
                ) : null}
                {message.role === "assistant" && message.status === "failed" ? (
                  <span className="message-status error">Response incomplete</span>
                ) : null}
                {message.role === "assistant"
                  && message.content
                  && message.status === "completed"
                  && canBranchAt(messages, index) ? (
                    <button
                      className="branch-button"
                      type="button"
                      onClick={() => onBranch(message.id)}
                      disabled={isStreaming}
                    >
                      <span aria-hidden="true">&#8627;</span>
                      Branch from this response
                    </button>
                  ) : null}
              </div>
            </article>
          ))
        )}
        <div ref={endRef} />
      </div>

      <p className="sr-only" aria-live="polite">{assistantAnnouncement}</p>

      <div className="composer-area">
        {error ? <p className="error-message">{error}</p> : null}
        <form className="composer" onSubmit={handleSubmit}>
          <textarea
            ref={textAreaRef}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask AOC Assistant..."
            aria-label="Message AOC Assistant"
            maxLength={MAX_INPUT_LENGTH}
            rows={1}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button
              className="send-button stop"
              type="button"
              onClick={() => abortRef.current?.abort()}
              aria-label="Stop response"
            >
              <span aria-hidden="true" />
            </button>
          ) : (
            <button
              className="send-button"
              type="submit"
              disabled={!input.trim()}
              aria-label="Send message"
            >
              <span aria-hidden="true">&uarr;</span>
            </button>
          )}
        </form>
        <p className="composer-help">
          Enter to send &middot; Shift + Enter for a new line &middot; Prototype
          responses may be inaccurate
        </p>
      </div>
    </div>
  );
}
