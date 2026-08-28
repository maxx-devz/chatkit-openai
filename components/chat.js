"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import aocIcon from "@/aoc-icon.png";
import aocLogo from "@/aoc-logo.png";

const MAX_INPUT_LENGTH = 12000;
const MAX_HISTORY_MESSAGES = 30;
const MAX_CONVERSATION_REPLIES = MAX_HISTORY_MESSAGES / 2;
const MAX_ASSET_DATA_URL_LENGTH = 12_000_000;
const CLIENT_TIMEOUT_MS = 55000;
const LOCAL_ASSET_SOURCES = {
  "aoc-icon": aocIcon.src,
  "aoc-logo": aocLogo.src,
};

function createMessage(role, content = "", modelId = "") {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return {
    id: `message-${randomId}`,
    role,
    content,
    status: role === "assistant" ? "streaming" : "completed",
    ...(role === "assistant"
      ? {
          phase: "queued",
          progressMessage: "Starting the request...",
          assets: [],
          ...(modelId ? { modelId } : {}),
        }
      : {}),
  };
}

function normalizeStreamAsset(value) {
  const localAsset = typeof value?.localAsset === "string"
    && Object.hasOwn(LOCAL_ASSET_SOURCES, value.localAsset)
    ? value.localAsset
    : "";
  const hasValidDataUrl = typeof value?.dataUrl === "string"
    && /^data:image\/(?:png|webp|jpeg);base64,/i.test(value.dataUrl)
    && value.dataUrl.length <= MAX_ASSET_DATA_URL_LENGTH;

  if (
    value?.kind !== "image"
    || typeof value?.id !== "string"
    || typeof value?.filename !== "string"
    || typeof value?.mimeType !== "string"
    || !value.mimeType.startsWith("image/")
    || (!localAsset && !hasValidDataUrl)
  ) {
    return null;
  }

  return {
    id: value.id.slice(0, 160),
    kind: "image",
    filename: value.filename.slice(0, 180),
    mimeType: value.mimeType.slice(0, 80),
    alt: typeof value.alt === "string"
      ? value.alt.slice(0, 180)
      : "AI-generated image",
    ...(localAsset ? { localAsset } : { dataUrl: value.dataUrl }),
  };
}

function assetSource(asset) {
  if (Object.hasOwn(LOCAL_ASSET_SOURCES, asset?.localAsset)) {
    return LOCAL_ASSET_SOURCES[asset.localAsset];
  }

  return typeof asset?.dataUrl === "string" ? asset.dataUrl : "";
}

function normalizeDiagnostic(value) {
  if (!value || typeof value !== "object") return null;

  const clean = (field, maxLength = 180) =>
    typeof value[field] === "string"
      ? value[field].trim().slice(0, maxLength)
      : "";
  const httpStatus = Number.isInteger(value.httpStatus)
    && value.httpStatus >= 100
    && value.httpStatus <= 599
    ? value.httpStatus
    : null;
  const diagnostic = {
    provider: clean("provider", 80),
    category: clean("category", 80),
    stage: clean("stage", 120),
    code: clean("code", 120),
    requestId: clean("requestId"),
    model: clean("model", 120),
    imageModel: clean("imageModel", 120),
    ...(httpStatus ? { httpStatus } : {}),
  };

  return Object.values(diagnostic).some(Boolean) ? diagnostic : null;
}

function normalizeUsage(value) {
  if (!value || typeof value !== "object") return null;

  const inputTokens = Number.isSafeInteger(value.inputTokens)
    && value.inputTokens >= 0
    ? value.inputTokens
    : null;
  const outputTokens = Number.isSafeInteger(value.outputTokens)
    && value.outputTokens >= 0
    ? value.outputTokens
    : null;
  const totalTokens = Number.isSafeInteger(value.totalTokens)
    && value.totalTokens >= 0
    ? value.totalTokens
    : null;

  return inputTokens === null || outputTokens === null || totalTokens === null
    ? null
    : { inputTokens, outputTokens, totalTokens };
}

function formatTokenCount(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function responseError(message, diagnostic) {
  const error = new Error(message);
  error.diagnostic = normalizeDiagnostic(diagnostic);
  return error;
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

function completedRequestHistory(messages) {
  const history = [];

  for (let index = 0; index + 1 < messages.length; index += 2) {
    const userMessage = messages[index];
    const assistantMessage = messages[index + 1];

    if (
      userMessage?.role !== "user"
      || assistantMessage?.role !== "assistant"
    ) {
      break;
    }

    const userContent = typeof userMessage.content === "string"
      ? userMessage.content.trim()
      : "";
    const assistantContent = typeof assistantMessage.content === "string"
      ? assistantMessage.content.trim()
      : "";

    // Failed, stopped, and legacy empty placeholders belong in the UI, but
    // they are not valid model conversation history.
    if (
      !userContent
      || !assistantContent
      || assistantMessage.status !== "completed"
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

export default function Chat({
  starters,
  messages,
  onMessagesChange,
  onNewConversation,
  onBranch,
  conversationTitle,
  folderName,
  autoFocusComposer,
  models,
  modelsStatus,
  modelsNotice,
  selectedModel,
  onModelChange,
}) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [assistantAnnouncement, setAssistantAnnouncement] = useState("");
  const abortRef = useRef(null);
  const sendingRef = useRef(false);
  const messagesRef = useRef(null);
  const textAreaRef = useRef(null);
  const headingRef = useRef(null);

  const isStreaming = status === "streaming";
  const completedReplies = completedRequestHistory(messages).length / 2;
  const remainingReplies = Math.max(
    0,
    MAX_CONVERSATION_REPLIES - completedReplies,
  );
  const recordedUsage = messages.reduce(
    (total, message) => ({
      inputTokens: total.inputTokens + (message.usage?.inputTokens || 0),
      outputTokens: total.outputTokens + (message.usage?.outputTokens || 0),
      totalTokens: total.totalTokens + (message.usage?.totalTokens || 0),
    }),
    { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
  const lastUsage = messages.findLast((message) => message.usage)?.usage || null;

  useEffect(() => {
    if (autoFocusComposer) textAreaRef.current?.focus();
    else headingRef.current?.focus({ preventScroll: true });
  }, [autoFocusComposer]);

  useEffect(() => {
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const messageLog = messagesRef.current;
    messageLog?.scrollTo({
      top: messageLog.scrollHeight,
      behavior: reduceMotion ? "auto" : "smooth",
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

    const requestHistory = completedRequestHistory(messages);

    if (
      messages.some(
        (message) =>
          message.role === "assistant" && message.status === "streaming",
      )
    ) {
      setError(
        "Wait for the current response to finish or stop it before sending another message.",
      );
      return;
    }

    if (requestHistory.length >= MAX_HISTORY_MESSAGES) {
      setError(
        "This chat reached the prototype history limit. Branch from an earlier response or start a new chat.",
      );
      return;
    }

    sendingRef.current = true;

    const userMessage = createMessage("user", content);
    const assistantMessage = createMessage("assistant", "", selectedModel);
    const requestMessages = [
      ...requestHistory,
      { role: "user", content: userMessage.content },
    ];

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
    let receivedAssets = 0;
    let requestTimedOut = false;
    const clientTimeout = window.setTimeout(() => {
      requestTimedOut = true;
      controller.abort();
    }, CLIENT_TIMEOUT_MS);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: requestMessages,
          ...(selectedModel ? { model: selectedModel } : {}),
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => null);
        throw responseError(
          payload?.error || "The assistant could not respond.",
          payload?.diagnostic,
        );
      }

      await readJsonLines(response, (event) => {
        if (event.type === "status") {
          const progressMessage = typeof event.message === "string"
            ? event.message.slice(0, 180)
            : "Processing...";
          const phase = typeof event.phase === "string"
            ? event.phase.slice(0, 50)
            : "processing";

          updateAssistant(assistantMessage.id, {
            phase,
            progressMessage,
          });
          setAssistantAnnouncement(progressMessage);
        }

        if (event.type === "delta" && typeof event.delta === "string") {
          receivedContent += event.delta;
          updateAssistant(assistantMessage.id, (message) => ({
            content: message.content + event.delta,
          }));
        }

        if (event.type === "asset") {
          const asset = normalizeStreamAsset(event.asset);
          if (!asset) {
            throw new Error("The server returned an invalid generated file.");
          }

          receivedAssets += 1;
          updateAssistant(assistantMessage.id, (message) => ({
            assets: [...(message.assets || []), asset],
          }));
        }

        if (event.type === "done") {
          const usage = normalizeUsage(event.usage);
          updateAssistant(assistantMessage.id, {
            ...(typeof event.model === "string"
              ? { modelId: event.model.slice(0, 100) }
              : {}),
            ...(usage ? { usage } : {}),
          });
        }

        if (event.type === "error") {
          throw responseError(
            event.message || "The response stream failed.",
            event.diagnostic,
          );
        }
      });

      if (!receivedContent.trim() && receivedAssets === 0) {
        throw new Error("The assistant returned no text or file.");
      }

      updateAssistant(assistantMessage.id, {
        status: "completed",
        phase: "completed",
        progressMessage: "",
      });
      setAssistantAnnouncement("Response complete.");
    } catch (requestError) {
      const stopped = requestError.name === "AbortError" && !requestTimedOut;
      const failureMessage = requestTimedOut
        ? "The response took too long and was stopped. Please try again."
        : stopped
          ? "Response stopped."
          : requestError.message || "Something went wrong.";
      setError("");
      setAssistantAnnouncement(
        stopped ? "Response stopped." : "Response incomplete.",
      );

      onMessagesChange((current) => {
        const assistant = current.find(
          (message) => message.id === assistantMessage.id,
        );

        return current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: assistant?.content.trim() ? assistant.content : "",
                errorMessage: failureMessage,
                ...(normalizeDiagnostic(requestError.diagnostic)
                  ? { diagnostic: normalizeDiagnostic(requestError.diagnostic) }
                  : {}),
                status: stopped ? "stopped" : "failed",
                phase: stopped ? "stopped" : "failed",
                progressMessage: "",
              }
            : message,
        );
      });
    } finally {
      window.clearTimeout(clientTimeout);
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

  function rejectFileInput(event) {
    const items = event.clipboardData?.items || event.dataTransfer?.items || [];
    const hasFile = [...items].some((item) => item.kind === "file");

    if (!hasFile) return;

    event.preventDefault();
    setError(
      "File attachments are not enabled in this prototype yet. Send text, or connect an authenticated file-storage service first.",
    );
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
        <div className="conversation-actions">
          <label className="model-picker" title={modelsNotice || undefined}>
            <span>Model</span>
            <select
              value={selectedModel}
              onChange={(event) => onModelChange(event.target.value)}
              disabled={isStreaming || modelsStatus === "loading" || !models.length}
              aria-label="OpenAI model"
            >
              {!models.length ? (
                <option value="">
                  {modelsStatus === "loading" ? "Loading models..." : "Server default"}
                </option>
              ) : null}
              {models.map((model) => (
                <option value={model.id} key={model.id}>{model.label}</option>
              ))}
            </select>
          </label>
          <details className="usage-status">
            <summary title="Conversation usage">
              <span className="usage-status-dot" aria-hidden="true" />
              {remainingReplies} left
            </summary>
            <div className="usage-popover">
              <div className="usage-popover-heading">
                <div>
                  <span>Conversation usage</span>
                  <strong>{remainingReplies} replies remaining</strong>
                </div>
                <span>{completedReplies}/{MAX_CONVERSATION_REPLIES}</span>
              </div>
              <div
                className="usage-progress"
                role="progressbar"
                aria-label="Conversation replies used"
                aria-valuemin="0"
                aria-valuemax={MAX_CONVERSATION_REPLIES}
                aria-valuenow={completedReplies}
              >
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      (completedReplies / MAX_CONVERSATION_REPLIES) * 100,
                    )}%`,
                  }}
                />
              </div>
              <dl className="usage-metrics">
                <div>
                  <dt>Recorded tokens</dt>
                  <dd>{formatTokenCount(recordedUsage.totalTokens)}</dd>
                </div>
                <div>
                  <dt>Input</dt>
                  <dd>{formatTokenCount(recordedUsage.inputTokens)}</dd>
                </div>
                <div>
                  <dt>Output</dt>
                  <dd>{formatTokenCount(recordedUsage.outputTokens)}</dd>
                </div>
              </dl>
              {lastUsage ? (
                <p className="last-response-usage">
                  Last response: {formatTokenCount(lastUsage.inputTokens)} input
                  <span aria-hidden="true"> + </span>
                  {formatTokenCount(lastUsage.outputTokens)} output tokens
                </p>
              ) : (
                <p className="last-response-usage">
                  Token usage will appear after the next OpenAI response.
                </p>
              )}
              <p className="usage-disclaimer">
                This shows this chat&apos;s history capacity and recorded API tokens,
                not the OpenAI billing-credit balance.
              </p>
            </div>
          </details>
          <button
            className="new-chat-button"
            type="button"
            onClick={newConversation}
          >
            New chat
          </button>
        </div>
      </div>

      <div
        className="messages"
        ref={messagesRef}
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
                {message.content
                  && !(message.status === "failed" && !message.errorMessage) ? (
                    <p>{message.content}</p>
                  ) : null}
                {!message.content && message.status === "completed" ? (
                  <p className="empty-response">No response was received.</p>
                ) : null}
                {message.role === "assistant" && message.assets?.length ? (
                  <div className="message-assets">
                    {message.assets.map((asset) => (
                      <figure className="generated-asset" key={asset.id}>
                        {assetSource(asset) ? (
                          <Image
                            className="generated-image"
                            src={assetSource(asset)}
                            alt={asset.alt || "AI-generated image"}
                            width={1024}
                            height={1024}
                            unoptimized
                          />
                        ) : (
                          <div className="asset-unavailable" role="note">
                            This generated image was not saved after the page
                            closed. Generate it again to restore the preview.
                          </div>
                        )}
                        <figcaption>
                          <span>{asset.filename}</span>
                          {assetSource(asset) ? (
                            <a
                              href={assetSource(asset)}
                              download={asset.filename}
                            >
                              Download image
                            </a>
                          ) : null}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}
                {message.role === "assistant" && message.status === "streaming" ? (
                  <span className="processing-status" role="status">
                    <i aria-hidden="true" />
                    {message.progressMessage || "Processing your request..."}
                  </span>
                ) : null}
                {message.role === "assistant" && message.status === "stopped" ? (
                  <span className="message-status">Response stopped</span>
                ) : null}
                {message.role === "assistant" && message.status === "failed" ? (
                  <span className="message-status error">
                    Response incomplete: {message.errorMessage
                      || message.content
                      || "Please try again."}
                  </span>
                ) : null}
                {message.role === "assistant"
                  && message.status === "failed"
                  && message.diagnostic ? (
                    <details className="request-diagnostic">
                      <summary>Technical details</summary>
                      <dl>
                        {message.diagnostic.stage ? (
                          <>
                            <dt>Stage</dt>
                            <dd>{message.diagnostic.stage}</dd>
                          </>
                        ) : null}
                        {message.diagnostic.httpStatus ? (
                          <>
                            <dt>HTTP status</dt>
                            <dd>{message.diagnostic.httpStatus}</dd>
                          </>
                        ) : null}
                        {message.diagnostic.category ? (
                          <>
                            <dt>Category</dt>
                            <dd>{message.diagnostic.category}</dd>
                          </>
                        ) : null}
                        {message.diagnostic.code ? (
                          <>
                            <dt>OpenAI code</dt>
                            <dd>{message.diagnostic.code}</dd>
                          </>
                        ) : null}
                        {message.diagnostic.model ? (
                          <>
                            <dt>Chat model</dt>
                            <dd>{message.diagnostic.model}</dd>
                          </>
                        ) : null}
                        {message.diagnostic.imageModel ? (
                          <>
                            <dt>Image model</dt>
                            <dd>{message.diagnostic.imageModel}</dd>
                          </>
                        ) : null}
                        {message.diagnostic.requestId ? (
                          <>
                            <dt>Request ID</dt>
                            <dd>{message.diagnostic.requestId}</dd>
                          </>
                        ) : null}
                      </dl>
                    </details>
                  ) : null}
                {message.role === "assistant"
                  && message.modelId
                  && message.status === "completed" ? (
                    <span className="message-model">Model: {message.modelId}</span>
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
            onPaste={rejectFileInput}
            onDrop={rejectFileInput}
            onDragOver={(event) => {
              if ([...event.dataTransfer.types].includes("Files")) {
                event.preventDefault();
              }
            }}
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
          Enter to send &middot; Models reflect this API key &middot; API usage may
          be billed separately
        </p>
      </div>
    </div>
  );
}
