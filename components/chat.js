"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";

import aocIcon from "@/aoc-icon.png";
import aocLogo from "@/aoc-logo.png";

const MAX_INPUT_LENGTH = 12000;
const MAX_ASSET_DATA_URL_LENGTH = 12_000_000;
const CLIENT_TIMEOUT_MS = 55000;
const MAX_CONTEXT_MESSAGES = 98;
const PAUSED_RESPONSE_MESSAGE =
  "Response paused when you switched chats. Return here and choose Retry response to continue.";
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

function normalizeClientUsage(value) {
  if (!value || typeof value !== "object") return null;
  const wholeNumber = (field, fallback = 0) =>
    Number.isSafeInteger(value[field]) && value[field] >= 0
      ? value[field]
      : fallback;
  const monthlyPromptLimit = Math.min(
    100000,
    Math.max(1, wholeNumber("monthlyPromptLimit", 150)),
  );
  const requestsUsed = wholeNumber("requestsUsed");

  return {
    enabled: value.enabled !== false,
    monthlyPromptLimit,
    requestsUsed,
    requestsRemaining: Math.max(
      0,
      Math.min(
        monthlyPromptLimit,
        wholeNumber("requestsRemaining", monthlyPromptLimit - requestsUsed),
      ),
    ),
    inputTokens: wholeNumber("inputTokens"),
    outputTokens: wholeNumber("outputTokens"),
    totalTokens: wholeNumber("totalTokens"),
    resetsAt: typeof value.resetsAt === "string" ? value.resetsAt : "",
  };
}

function formatTokenCount(value) {
  return new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(value);
}

function formatResetDate(value) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "the next monthly reset";

  return new Intl.DateTimeFormat(undefined, {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(date);
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
  aiAccess,
  onAiUsageChange,
}) {
  const [input, setInput] = useState("");
  const [status, setStatus] = useState("idle");
  const [error, setError] = useState("");
  const [assistantAnnouncement, setAssistantAnnouncement] = useState("");
  const abortRef = useRef(null);
  const requestMetaRef = useRef(null);
  const sendingRef = useRef(false);
  const messagesRef = useRef(null);
  const textAreaRef = useRef(null);
  const headingRef = useRef(null);

  const isStreaming = status === "streaming";
  const monthlyRemaining = Math.max(0, aiAccess?.requestsRemaining || 0);
  const disabledByAdmin = aiAccess?.enabled === false;
  const monthlyLimitReached = !disabledByAdmin && monthlyRemaining === 0;
  const accessBlocked = disabledByAdmin || monthlyLimitReached;
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
    return () => {
      const activeRequest = requestMetaRef.current;
      if (activeRequest) {
        activeRequest.paused = true;
        onMessagesChange((current) => current.map((message) => (
          message.id === activeRequest.assistantMessageId
            ? {
                ...message,
                content: message.content?.trim() || PAUSED_RESPONSE_MESSAGE,
                errorMessage: PAUSED_RESPONSE_MESSAGE,
                status: "stopped",
                phase: "stopped",
                progressMessage: "",
              }
            : message
        )));
        requestMetaRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!accessBlocked) return;

    if (disabledByAdmin) abortRef.current?.abort();
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    messagesRef.current?.scrollTo({
      top: 0,
      behavior: reduceMotion ? "auto" : "smooth",
    });
  }, [accessBlocked, disabledByAdmin]);

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

  async function sendMessage(text, { retryAssistantId = "" } = {}) {
    const content = text.trim();
    if (!content || sendingRef.current) return;

    const retryIndex = retryAssistantId
      ? messages.findIndex((message) => message.id === retryAssistantId)
      : -1;
    const retryUserMessage = retryIndex > 0 ? messages[retryIndex - 1] : null;
    const retrying = Boolean(
      retryUserMessage?.role === "user"
      && messages[retryIndex]?.role === "assistant"
      && ["stopped", "failed"].includes(messages[retryIndex]?.status),
    );
    const baseMessages = retrying
      ? messages.filter((message) => message.id !== retryUserMessage.id && message.id !== retryAssistantId)
      : messages;
    const requestHistory = completedRequestHistory(baseMessages)
      .slice(-MAX_CONTEXT_MESSAGES);

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

    if (disabledByAdmin) {
      setError("The AI assistant is currently paused for this client.");
      return;
    }

    if (monthlyRemaining <= 0) {
      setError("This client has reached its monthly AI request allowance.");
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
      ...(retrying
        ? current.filter(
            (message) => message.id !== retryUserMessage.id
              && message.id !== retryAssistantId,
          )
        : current),
      userMessage,
      assistantMessage,
    ]);

    const controller = new AbortController();
    abortRef.current = controller;
    const requestMeta = {
      controller,
      assistantMessageId: assistantMessage.id,
      paused: false,
    };
    requestMetaRef.current = requestMeta;
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
        const nextClientUsage = normalizeClientUsage(
          payload?.clientUsage || payload?.usage,
        );
        if (nextClientUsage) onAiUsageChange(nextClientUsage);
        throw responseError(
          payload?.error || "The assistant could not respond.",
          payload?.diagnostic,
        );
      }

      await readJsonLines(response, (event) => {
        const nextClientUsage = normalizeClientUsage(event.clientUsage);
        if (nextClientUsage) onAiUsageChange(nextClientUsage);

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
        : requestMeta.paused
          ? PAUSED_RESPONSE_MESSAGE
          : stopped
            ? "Response stopped. Choose Retry response to continue."
          : requestError.message || "Something went wrong.";
      setError("");
      setAssistantAnnouncement(
        requestMeta.paused || stopped ? "Response paused." : "Response incomplete.",
      );

      onMessagesChange((current) => {
        const assistant = current.find(
          (message) => message.id === assistantMessage.id,
        );

        return current.map((message) =>
          message.id === assistantMessage.id
            ? {
                ...message,
                content: assistant?.content.trim() ? assistant.content : failureMessage,
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
        requestMetaRef.current = null;
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

  function retryMessage(assistantMessageId) {
    const index = messages.findIndex((message) => message.id === assistantMessageId);
    const previous = index > 0 ? messages[index - 1] : null;
    if (
      previous?.role !== "user"
      || messages[index]?.role !== "assistant"
      || !["stopped", "failed"].includes(messages[index]?.status)
    ) return;

    sendMessage(previous.content, { retryAssistantId: assistantMessageId });
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
    const activeRequest = requestMetaRef.current;
    if (activeRequest) {
      activeRequest.paused = true;
      onMessagesChange((current) => current.map((message) => (
        message.id === activeRequest.assistantMessageId
          ? {
              ...message,
              content: message.content?.trim() || PAUSED_RESPONSE_MESSAGE,
              errorMessage: PAUSED_RESPONSE_MESSAGE,
              status: "stopped",
              phase: "stopped",
              progressMessage: "",
            }
          : message
      )));
      requestMetaRef.current = null;
    }
    abortRef.current?.abort();
    onNewConversation();
  }

  return (
    <div
      className={`chat${accessBlocked ? " ai-access-restricted" : ""}`}
      aria-busy={isStreaming}
    >
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
              disabled={
                isStreaming
                || accessBlocked
                || modelsStatus === "loading"
                || !models.length
              }
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
          <details className={`usage-status${disabledByAdmin ? " is-paused" : ""}`}>
            <summary title="Monthly AI request allowance">
              <span className="usage-status-dot" aria-hidden="true" />
              {disabledByAdmin ? "AI paused" : `${monthlyRemaining} left`}
            </summary>
            <div className="usage-popover">
              <div className="usage-popover-heading">
                <div>
                  <span>Monthly AI allowance</span>
                  <strong>{monthlyRemaining} requests remaining</strong>
                </div>
                <span>{aiAccess?.requestsUsed || 0}/{aiAccess?.monthlyPromptLimit || 0}</span>
              </div>
              <div
                className="usage-progress"
                role="progressbar"
                aria-label="Monthly AI requests used"
                aria-valuemin="0"
                aria-valuemax={aiAccess?.monthlyPromptLimit || 1}
                aria-valuenow={aiAccess?.requestsUsed || 0}
              >
                <span
                  style={{
                    width: `${Math.min(
                      100,
                      ((aiAccess?.requestsUsed || 0)
                        / (aiAccess?.monthlyPromptLimit || 1)) * 100,
                    )}%`,
                  }}
                />
              </div>
              <dl className="usage-metrics">
                <div>
                  <dt>Monthly input</dt>
                  <dd>{formatTokenCount(aiAccess?.inputTokens || 0)}</dd>
                </div>
                <div>
                  <dt>Monthly output</dt>
                  <dd>{formatTokenCount(aiAccess?.outputTokens || 0)}</dd>
                </div>
                <div>
                  <dt>Monthly total</dt>
                  <dd>{formatTokenCount(aiAccess?.totalTokens || 0)}</dd>
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
                The request allowance is set by AOC and resets monthly. It is
                separate from the OpenAI project&apos;s billing-credit balance.
              </p>
            </div>
          </details>
          <button
            className="new-chat-button"
            type="button"
            onClick={newConversation}
            disabled={accessBlocked}
            title={accessBlocked ? "New AI chats are unavailable while access is paused." : undefined}
          >
            New chat
          </button>
        </div>
      </div>

      <div
        className={`messages${accessBlocked ? " access-restricted" : ""}`}
        ref={messagesRef}
        role="log"
        aria-live="off"
      >
        {accessBlocked ? (
          <section className="ai-access-notice" role="status">
            <div className="ai-access-notice-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24">
                <path d="M7 10V8a5 5 0 0 1 10 0v2" />
                <path d="M6 10h12a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" />
                <path d="M12 14v3" />
              </svg>
            </div>
            <span className="ai-access-notice-eyebrow">
              {disabledByAdmin ? "Account access paused" : "Monthly allowance used"}
            </span>
            <h2>
              {disabledByAdmin
                ? "AI Assistant is currently disabled"
                : "Monthly AI allowance reached"}
            </h2>
            <p>
              {disabledByAdmin
                ? "Your AOC administrator has paused new AI requests for this client. You can still review saved conversations, and this page will unlock automatically when access is restored."
                : `New AI requests are paused until ${formatResetDate(aiAccess?.resetsAt)} or until AOC adjusts this account's allowance.`}
            </p>
            <div className="ai-access-notice-status">
              <span><i aria-hidden="true" /> New AI requests blocked</span>
              <small>Saved conversation history remains available</small>
            </div>
          </section>
        ) : null}
        {messages.length === 0 && !accessBlocked ? (
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
                  disabled={isStreaming || accessBlocked}
                >
                  {starter}
                  <span aria-hidden="true">&rarr;</span>
                </button>
              ))}
            </div>
          </div>
        ) : messages.length ? (
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
                  <div className="message-status message-status--retryable">
                    <span>{message.errorMessage || "Response paused. Choose Retry response to continue."}</span>
                    <button
                      type="button"
                      onClick={() => retryMessage(message.id)}
                      disabled={isStreaming}
                    >
                      Retry response
                    </button>
                  </div>
                ) : null}
                {message.role === "assistant" && message.status === "failed" ? (
                  <div className="message-status error message-status--retryable">
                    <span>
                      Response incomplete: {message.errorMessage
                        || message.content
                        || "Please try again."}
                    </span>
                    <button
                      type="button"
                      onClick={() => retryMessage(message.id)}
                      disabled={isStreaming}
                    >
                      Retry response
                    </button>
                  </div>
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
        ) : null}
      </div>

      <p className="sr-only" aria-live="polite">{assistantAnnouncement}</p>

      <div className={`composer-area${accessBlocked ? " access-restricted" : ""}`}>
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
            placeholder={accessBlocked ? "AI Assistant is unavailable" : "Ask AOC Assistant..."}
            aria-label="Message AOC Assistant"
            maxLength={MAX_INPUT_LENGTH}
            rows={1}
            disabled={isStreaming || accessBlocked}
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
              disabled={!input.trim() || accessBlocked}
              aria-label="Send message"
            >
              <span aria-hidden="true">&uarr;</span>
            </button>
          )}
        </form>
        <p className="composer-help">
          {aiAccess?.enabled === false
            ? "AI access is paused by your AOC administrator"
            : monthlyRemaining === 0
              ? "Monthly AI request allowance reached"
              : "Enter to send · Models reflect this API key · API usage may be billed separately"}
        </p>
      </div>
    </div>
  );
}
