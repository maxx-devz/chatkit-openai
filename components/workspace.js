"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";

import Chat from "@/components/chat";
import aocIcon from "@/aoc-icon.png";
import aocLogo from "@/aoc-logo.png";

const STORAGE_KEY = "aoc-chat-workspace-v1";
const STORAGE_VERSION = 1;
const MAX_FOLDERS = 30;
const MAX_THREADS = 150;
const MAX_STORED_MESSAGES = 100;
const MAX_FOLDER_NAME = 60;
const MAX_TITLE_LENGTH = 72;
const MAX_MESSAGE_LENGTH = 12000;
const MAX_MESSAGE_ASSETS = 4;
const MAX_ASSET_TEXT_LENGTH = 180;
const MAX_ERROR_MESSAGE_LENGTH = 500;
const MAX_REASONABLE_FUTURE_MS = 365 * 24 * 60 * 60 * 1000;

const INITIAL_WORKSPACE = {
  version: STORAGE_VERSION,
  folders: [{ id: "folder-general", name: "General", createdAt: 0 }],
  threads: [],
  activeFolderId: "folder-general",
  activeThreadId: null,
};

function createId(prefix) {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `${prefix}-${randomId}`;
}

function createFolder(name) {
  return {
    id: createId("folder"),
    name,
    createdAt: Date.now(),
  };
}

function createThread(folderId, overrides = {}) {
  const now = Date.now();

  return {
    id: createId("chat"),
    folderId,
    title: "",
    messages: [],
    createdAt: now,
    updatedAt: now,
    parentThreadId: null,
    branchedFromMessageId: null,
    ...overrides,
  };
}

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function validTimestamp(value, fallback) {
  return Number.isSafeInteger(value)
    && value >= 0
    && value <= Date.now() + MAX_REASONABLE_FUTURE_MS
    ? value
    : fallback;
}

function limitThreads(threads, protectedThreadIds = []) {
  if (threads.length <= MAX_THREADS) return threads;

  const protectedIds = new Set(protectedThreadIds.filter(Boolean));
  const removable = threads
    .filter((thread) => !protectedIds.has(thread.id))
    .sort((a, b) => a.updatedAt - b.updatedAt);
  const removeCount = threads.length - MAX_THREADS;
  const removedIds = new Set(
    removable.slice(0, removeCount).map((thread) => thread.id),
  );

  return threads.filter((thread) => !removedIds.has(thread.id));
}

function workspaceForStorage(workspace) {
  return {
    version: STORAGE_VERSION,
    folders: workspace.folders.map(({ id, name, createdAt }) => ({
      id,
      name,
      createdAt,
    })),
    threads: workspace.threads.map((thread) => ({
      id: thread.id,
      folderId: thread.folderId,
      title: thread.title,
      messages: thread.messages.map((message) => ({
        id: message.id,
        role: message.role,
        content: message.content,
        status: message.status,
        ...(message.errorMessage
          ? { errorMessage: message.errorMessage }
          : {}),
        ...(message.diagnostic ? { diagnostic: message.diagnostic } : {}),
        ...(message.originMessageId
          ? { originMessageId: message.originMessageId }
          : {}),
        ...(message.modelId ? { modelId: message.modelId } : {}),
        ...(message.usage ? { usage: message.usage } : {}),
        ...(Array.isArray(message.assets) && message.assets.length
          ? {
              assets: message.assets.slice(0, MAX_MESSAGE_ASSETS).map((asset) => ({
                id: asset.id,
                kind: asset.kind,
                filename: asset.filename,
                mimeType: asset.mimeType,
                alt: asset.alt,
                ...(asset.localAsset
                  ? { localAsset: asset.localAsset }
                  : {}),
              })),
            }
          : {}),
      })),
      createdAt: thread.createdAt,
      updatedAt: thread.updatedAt,
      parentThreadId: thread.parentThreadId,
      branchedFromMessageId: thread.branchedFromMessageId,
    })),
    activeFolderId: workspace.activeFolderId,
    activeThreadId: workspace.activeThreadId,
  };
}

function writeWorkspace(workspace) {
  window.localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(workspaceForStorage(workspace)),
  );
}

function normalizeAssets(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_MESSAGE_ASSETS).flatMap((candidate) => {
    const id = cleanString(candidate?.id, 160);
    const kind = cleanString(candidate?.kind, 30);
    const filename = cleanString(candidate?.filename, MAX_ASSET_TEXT_LENGTH);
    const mimeType = cleanString(candidate?.mimeType, 80);
    const alt = cleanString(candidate?.alt, MAX_ASSET_TEXT_LENGTH);
    const localAsset = cleanString(candidate?.localAsset, 40);

    if (
      !id
      || kind !== "image"
      || !filename
      || !mimeType.startsWith("image/")
      || (localAsset && !["aoc-icon", "aoc-logo"].includes(localAsset))
    ) {
      return [];
    }

    return [{
      id,
      kind,
      filename,
      mimeType,
      alt: alt || "Generated image",
      ...(localAsset ? { localAsset } : {}),
    }];
  });
}

function normalizeDiagnostic(value) {
  if (!value || typeof value !== "object") return null;

  const httpStatus = Number.isInteger(value.httpStatus)
    && value.httpStatus >= 100
    && value.httpStatus <= 599
    ? value.httpStatus
    : null;
  const diagnostic = {
    provider: cleanString(value.provider, 80),
    category: cleanString(value.category, 80),
    stage: cleanString(value.stage, 120),
    code: cleanString(value.code, 120),
    requestId: cleanString(value.requestId, 180),
    model: cleanString(value.model, 120),
    imageModel: cleanString(value.imageModel, 120),
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

function normalizeMessages(value) {
  if (!Array.isArray(value)) return [];

  const messages = [];
  const messageIds = new Set();

  for (const candidate of value.slice(0, MAX_STORED_MESSAGES)) {
    const expectedRole = messages.length % 2 === 0 ? "user" : "assistant";
    const role = candidate?.role;
    const content = cleanString(candidate?.content, MAX_MESSAGE_LENGTH);

    if (role !== expectedRole) break;

    let id = cleanString(candidate?.id, 160) || createId("message");
    if (messageIds.has(id)) id = createId("message");
    messageIds.add(id);

    if (!content) {
      if (
        role === "assistant"
        && ["streaming", "stopped", "failed"].includes(candidate?.status)
      ) {
        const status = candidate.status === "streaming"
          ? "stopped"
          : candidate.status;
        const errorMessage = cleanString(
          candidate?.errorMessage,
          MAX_ERROR_MESSAGE_LENGTH,
        );
        const diagnostic = normalizeDiagnostic(candidate?.diagnostic);

        messages.push({
          id,
          role,
          content: "",
          status,
          ...(errorMessage ? { errorMessage } : {}),
          ...(diagnostic ? { diagnostic } : {}),
        });
        continue;
      }
      break;
    }

    let status = "completed";
    if (role === "assistant") {
      const savedStatus = candidate?.status;
      status = savedStatus === "streaming"
        ? "stopped"
        : ["completed", "stopped", "failed"].includes(savedStatus)
          ? savedStatus
          : "completed";
    }

    const assets = normalizeAssets(candidate?.assets);
    const usage = normalizeUsage(candidate?.usage);

    messages.push({
      id,
      role,
      content,
      status,
      ...(assets.length ? { assets } : {}),
      ...(usage ? { usage } : {}),
      ...(cleanString(candidate?.modelId, 100)
        ? { modelId: cleanString(candidate.modelId, 100) }
        : {}),
      ...(cleanString(candidate?.originMessageId, 160)
        ? { originMessageId: cleanString(candidate.originMessageId, 160) }
        : {}),
      ...(cleanString(candidate?.errorMessage, MAX_ERROR_MESSAGE_LENGTH)
        ? {
            errorMessage: cleanString(
              candidate.errorMessage,
              MAX_ERROR_MESSAGE_LENGTH,
            ),
          }
        : {}),
      ...(normalizeDiagnostic(candidate?.diagnostic)
        ? { diagnostic: normalizeDiagnostic(candidate.diagnostic) }
        : {}),
    });
  }

  // A legacy user message without an assistant placeholder cannot be continued
  // safely because the API history must alternate by role.
  if (messages.at(-1)?.role === "user") messages.pop();

  return messages;
}

function normalizeWorkspace(value) {
  if (!value || typeof value !== "object" || value.version !== STORAGE_VERSION) {
    throw new Error("Unsupported saved workspace.");
  }

  const now = Date.now();
  const folderIds = new Set();
  const folders = [];

  for (const candidate of Array.isArray(value.folders)
    ? value.folders.slice(0, MAX_FOLDERS)
    : []) {
    const id = cleanString(candidate?.id, 160);
    const name = cleanString(candidate?.name, MAX_FOLDER_NAME);

    if (!id || !name || folderIds.has(id)) continue;
    folderIds.add(id);
    folders.push({
      id,
      name,
      createdAt: validTimestamp(candidate?.createdAt, now),
    });
  }

  if (!folders.length) {
    const fallback = createFolder("General");
    folders.push(fallback);
    folderIds.add(fallback.id);
  }

  const threadIds = new Set();
  const threads = [];

  const threadCandidates = Array.isArray(value.threads)
    ? [...value.threads]
      .sort((a, b) => {
        const aUpdatedAt = Number.isFinite(a?.updatedAt) ? a.updatedAt : 0;
        const bUpdatedAt = Number.isFinite(b?.updatedAt) ? b.updatedAt : 0;
        return bUpdatedAt - aUpdatedAt;
      })
      .slice(0, MAX_THREADS)
    : [];

  for (const candidate of threadCandidates) {
    const id = cleanString(candidate?.id, 160);
    const folderId = cleanString(candidate?.folderId, 160);

    if (!id || threadIds.has(id) || !folderIds.has(folderId)) continue;
    threadIds.add(id);

    const createdAt = validTimestamp(candidate?.createdAt, now);
    const updatedAt = validTimestamp(candidate?.updatedAt, createdAt);
    threads.push({
      id,
      folderId,
      title: cleanString(candidate?.title, MAX_TITLE_LENGTH),
      messages: normalizeMessages(candidate?.messages),
      createdAt,
      updatedAt: Math.max(createdAt, updatedAt),
      parentThreadId: cleanString(candidate?.parentThreadId, 160) || null,
      branchedFromMessageId:
        cleanString(candidate?.branchedFromMessageId, 160) || null,
    });
  }

  const requestedFolderId = cleanString(value.activeFolderId, 160);
  let activeFolderId = folderIds.has(requestedFolderId)
    ? requestedFolderId
    : folders[0].id;
  const requestedThreadId = cleanString(value.activeThreadId, 160);
  let activeThread = threads.find(
    (thread) =>
      thread.id === requestedThreadId && thread.folderId === activeFolderId,
  );

  if (!activeThread) {
    activeThread = threads
      .filter((thread) => thread.folderId === activeFolderId)
      .sort((a, b) => b.updatedAt - a.updatedAt)[0];
  }

  if (!activeThread) {
    const draft = createThread(activeFolderId);
    threads.push(draft);
    activeThread = draft;
  } else {
    activeFolderId = activeThread.folderId;
  }

  return {
    version: STORAGE_VERSION,
    folders,
    threads,
    activeFolderId,
    activeThreadId: activeThread.id,
  };
}

function createDefaultWorkspace() {
  const folder = createFolder("General");
  const thread = createThread(folder.id);

  return {
    version: STORAGE_VERSION,
    folders: [folder],
    threads: [thread],
    activeFolderId: folder.id,
    activeThreadId: thread.id,
  };
}

function titleFromMessages(messages) {
  const firstPrompt = messages.find((message) => message.role === "user")?.content;
  if (!firstPrompt) return "";

  const oneLine = firstPrompt.replace(/\s+/g, " ").trim();
  return oneLine.length > MAX_TITLE_LENGTH
    ? `${oneLine.slice(0, MAX_TITLE_LENGTH - 1)}…`
    : oneLine;
}

function displayTitle(thread) {
  return thread?.title || titleFromMessages(thread?.messages || []) || "New chat";
}

function formatUpdated(timestamp) {
  if (!timestamp) return "";

  const date = new Date(timestamp);
  const today = new Date();
  const sameDay = date.toDateString() === today.toDateString();

  return new Intl.DateTimeFormat(undefined, sameDay
    ? { hour: "numeric", minute: "2-digit" }
    : { month: "short", day: "numeric" }).format(date);
}

function FolderList({ folders, activeFolderId, threads, onSelect, disabled }) {
  return (
    <div className="folder-list" aria-label="Folders">
      {folders.map((folder) => {
        const chatCount = threads.filter(
          (thread) => thread.folderId === folder.id && thread.messages.length,
        ).length;

        return (
          <button
            className="folder-row"
            key={folder.id}
            type="button"
            onClick={() => onSelect(folder.id)}
            aria-current={folder.id === activeFolderId ? "true" : undefined}
            disabled={disabled}
          >
            <span className="folder-icon" aria-hidden="true" />
            <span className="folder-name" title={folder.name}>{folder.name}</span>
            <span className="folder-count" aria-label={`${chatCount} saved chats`}>
              {chatCount}
            </span>
          </button>
        );
      })}
    </div>
  );
}

function HistoryList({ threads, activeThreadId, onSelect, emptyMessage }) {
  if (!threads.length) {
    return <p className="history-empty">{emptyMessage}</p>;
  }

  return (
    <div className="history-list" aria-label="Saved chats">
      {threads.map((thread) => {
        const title = displayTitle(thread);

        return (
          <button
            className="history-row"
            key={thread.id}
            type="button"
            onClick={() => onSelect(thread.id)}
            aria-current={thread.id === activeThreadId ? "true" : undefined}
          >
            <span className="history-title" title={title}>{title}</span>
            <span className="history-meta">
              {thread.parentThreadId ? (
                <span className="branch-label">Branch</span>
              ) : null}
              <time dateTime={new Date(thread.updatedAt).toISOString()}>
                {formatUpdated(thread.updatedAt)}
              </time>
            </span>
          </button>
        );
      })}
    </div>
  );
}

export default function Workspace({ config, embedded = false }) {
  const [workspace, setWorkspace] = useState(INITIAL_WORKSPACE);
  const [hydrated, setHydrated] = useState(false);
  const [storageStatus, setStorageStatus] = useState("loading");
  const [storageMode, setStorageMode] = useState("loading");
  const [storageWarning, setStorageWarning] = useState("");
  const [clientProfile, setClientProfile] = useState({ name: "", slug: "" });
  const [knowledgeStats, setKnowledgeStats] = useState({ approved: 0, pending: 0 });
  const [folderName, setFolderName] = useState("");
  const [folderError, setFolderError] = useState("");
  const [announcement, setAnnouncement] = useState("");
  const [focusComposer, setFocusComposer] = useState(false);
  const [models, setModels] = useState([]);
  const [modelsStatus, setModelsStatus] = useState("loading");
  const [modelsNotice, setModelsNotice] = useState("");
  const [selectedModel, setSelectedModel] = useState("");
  const addFolderDialogRef = useRef(null);
  const folderInputRef = useRef(null);
  const mobileHistoryDialogRef = useRef(null);
  const workspaceRef = useRef(INITIAL_WORKSPACE);
  const hydratedRef = useRef(false);
  const storageModeRef = useRef("loading");
  const saveTimerRef = useRef(null);
  const saveStatusTimerRef = useRef(null);
  const saveInFlightRef = useRef(false);
  const saveQueuedRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();

    async function hydrateWorkspace() {
      let browserWorkspace;
      let browserWarning = "";

      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        browserWorkspace = saved
          ? normalizeWorkspace(JSON.parse(saved))
          : createDefaultWorkspace();
      } catch {
        browserWorkspace = createDefaultWorkspace();
        browserWarning = "Saved browser history was damaged and has been reset.";
      }

      let nextWorkspace = browserWorkspace;
      let nextMode = "browser";
      let warning = browserWarning;

      try {
        const response = await fetch("/api/workspace", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok) {
          throw new Error(payload?.error || "Account history could not be loaded.");
        }

        setClientProfile({
          name: payload?.client?.name || "",
          slug: payload?.client?.slug || "",
        });
        setKnowledgeStats({
          approved: Number(payload?.knowledge?.approved) || 0,
          pending: Number(payload?.knowledge?.pending) || 0,
        });

        if (payload?.mode === "database") {
          nextMode = "database";
          nextWorkspace = payload.workspace
            ? normalizeWorkspace(payload.workspace)
            : createDefaultWorkspace();
          warning = "";
        }
      } catch (error) {
        if (error.name === "AbortError") return;
        warning = [
          browserWarning,
          `${error.message || "Neon history could not be loaded."} Using browser history for now.`,
        ].filter(Boolean).join(" ");
      }

      setWorkspace(nextWorkspace);
      setStorageMode(nextMode);
      storageModeRef.current = nextMode;
      setStorageWarning(warning);
      setStorageStatus("saved");
      setHydrated(true);
    }

    hydrateWorkspace();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    async function loadModels() {
      try {
        const response = await fetch("/api/models", {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);

        if (!response.ok || !Array.isArray(payload?.models)) {
          throw new Error(payload?.error || "Model access could not be loaded.");
        }

        setModels(payload.models);
        setSelectedModel((current) =>
          payload.models.some((model) => model.id === current)
            ? current
            : payload.defaultModel || payload.models[0]?.id || "",
        );
        setModelsNotice(
          [payload.notice, payload.billingNotice].filter(Boolean).join(" "),
        );
        setModelsStatus(payload.verified ? "ready" : "unverified");
      } catch (error) {
        if (error.name === "AbortError") return;
        setModelsStatus("error");
        setModelsNotice(error.message || "Model access could not be loaded.");
      }
    }

    loadModels();
    return () => controller.abort();
  }, []);

  useEffect(() => {
    workspaceRef.current = workspace;
  }, [workspace]);

  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  useEffect(() => {
    storageModeRef.current = storageMode;
  }, [storageMode]);

  useEffect(() => {
    if (!hydrated) return;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
    }
    if (saveStatusTimerRef.current !== null) {
      window.clearTimeout(saveStatusTimerRef.current);
    }

    saveStatusTimerRef.current = window.setTimeout(() => {
      saveStatusTimerRef.current = null;
      setStorageStatus("saving");
    }, 0);

    saveTimerRef.current = window.setTimeout(async () => {
      saveTimerRef.current = null;

      if (saveInFlightRef.current) {
        saveQueuedRef.current = true;
        return;
      }

      do {
        saveQueuedRef.current = false;
        saveInFlightRef.current = true;

        try {
          const snapshot = workspaceForStorage(workspaceRef.current);

          if (storageModeRef.current === "database") {
            const response = await fetch("/api/workspace", {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ workspace: snapshot }),
            });
            const payload = await response.json().catch(() => null);

            if (!response.ok) {
              throw new Error(payload?.error || "Account history could not be saved.");
            }
          } else {
            writeWorkspace(snapshot);
          }

          setStorageWarning("");
          setStorageStatus("saved");
        } catch (error) {
          setStorageWarning(error.message || "Chat history could not be saved.");
          setStorageStatus("error");
        } finally {
          saveInFlightRef.current = false;
        }
      } while (saveQueuedRef.current);
    }, 700);

    return () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (saveStatusTimerRef.current !== null) {
        window.clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = null;
      }
    };
  }, [hydrated, storageMode, workspace]);

  useEffect(() => {
    function flushWorkspace() {
      if (!hydratedRef.current) return;

      if (storageModeRef.current === "browser") {
        try {
          writeWorkspace(workspaceRef.current);
        } catch {
          // The page may be exiting, so normal saves report the error instead.
        }
      }
    }

    window.addEventListener("pagehide", flushWorkspace);
    return () => {
      window.removeEventListener("pagehide", flushWorkspace);
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
      if (saveStatusTimerRef.current !== null) {
        window.clearTimeout(saveStatusTimerRef.current);
        saveStatusTimerRef.current = null;
      }
      flushWorkspace();
    };
  }, []);

  const activeFolder = workspace.folders.find(
    (folder) => folder.id === workspace.activeFolderId,
  ) || workspace.folders[0];
  const activeThread = workspace.threads.find(
    (thread) => thread.id === workspace.activeThreadId,
  );
  const visibleThreads = useMemo(
    () => workspace.threads
      .filter(
        (thread) =>
          thread.folderId === workspace.activeFolderId
          && thread.messages.length > 0,
      )
      .sort((a, b) => b.updatedAt - a.updatedAt),
    [workspace.activeFolderId, workspace.threads],
  );
  const conversationGroups = useMemo(
    () => workspace.folders.map((folder) => ({
      ...folder,
      threads: workspace.threads
        .filter(
          (thread) =>
            thread.folderId === folder.id
            && (thread.messages.length > 0 || thread.id === workspace.activeThreadId),
        )
        .sort((a, b) => b.updatedAt - a.updatedAt),
    })).filter((folder) => folder.threads.length > 0),
    [workspace.activeThreadId, workspace.folders, workspace.threads],
  );
  const savedConversationCount = workspace.threads.filter(
    (thread) => thread.messages.length > 0,
  ).length;

  function createNewChat(folderId = workspace.activeFolderId) {
    const draft = createThread(folderId);

    setWorkspace((current) => ({
      ...current,
      threads: limitThreads(
        [
          ...current.threads.filter(
            (thread) => !(thread.folderId === folderId && !thread.messages.length),
          ),
          draft,
        ],
        [draft.id],
      ),
      activeFolderId: folderId,
      activeThreadId: draft.id,
    }));
    setFocusComposer(true);
    setAnnouncement("New chat ready.");
    mobileHistoryDialogRef.current?.close();
  }

  function selectFolder(folderId) {
    setFocusComposer(false);
    setWorkspace((current) => {
      if (!current.folders.some((folder) => folder.id === folderId)) {
        return current;
      }

      const nextThread = current.threads
        .filter((thread) => thread.folderId === folderId)
        .sort((a, b) => b.updatedAt - a.updatedAt)[0];

      if (nextThread) {
        return {
          ...current,
          activeFolderId: folderId,
          activeThreadId: nextThread.id,
        };
      }

      const draft = createThread(folderId);
      return {
        ...current,
        threads: limitThreads([...current.threads, draft], [draft.id]),
        activeFolderId: folderId,
        activeThreadId: draft.id,
      };
    });
  }

  function selectThread(threadId) {
    setFocusComposer(false);
    setWorkspace((current) => {
      const thread = current.threads.find((candidate) => candidate.id === threadId);
      if (!thread) return current;

      return {
        ...current,
        activeFolderId: thread.folderId,
        activeThreadId: thread.id,
      };
    });
    mobileHistoryDialogRef.current?.close();
  }

  function updateThreadMessages(threadId, update) {
    setWorkspace((current) => ({
      ...current,
      threads: current.threads.map((thread) => {
        if (thread.id !== threadId) return thread;

        const messages = typeof update === "function"
          ? update(thread.messages)
          : update;

        return {
          ...thread,
          messages,
          title: thread.title || titleFromMessages(messages),
          updatedAt: Date.now(),
        };
      }),
    }));
  }

  function branchFromMessage(sourceThreadId, messageId) {
    setFocusComposer(true);
    setWorkspace((current) => {
      const source = current.threads.find(
        (thread) => thread.id === sourceThreadId,
      );
      if (!source) return current;

      const branchIndex = source.messages.findIndex(
        (message) => message.id === messageId,
      );
      const branchPoint = source.messages[branchIndex];
      if (
        branchIndex < 0
        || branchPoint?.role !== "assistant"
        || branchPoint.status !== "completed"
      ) {
        return current;
      }

      const copiedMessages = source.messages
        .slice(0, branchIndex + 1)
        .map((message) => ({
          ...message,
          id: createId("message"),
          originMessageId: message.originMessageId || message.id,
        }));
      const sourceTitle = displayTitle(source);
      const branchTitle = `${sourceTitle} · Branch`.slice(0, MAX_TITLE_LENGTH);
      const branch = createThread(source.folderId, {
        title: branchTitle,
        messages: copiedMessages,
        parentThreadId: source.id,
        branchedFromMessageId: messageId,
      });

      return {
        ...current,
        threads: limitThreads(
          [...current.threads, branch],
          [source.id, branch.id],
        ),
        activeFolderId: source.folderId,
        activeThreadId: branch.id,
      };
    });

    setAnnouncement("Branch created. The original chat is unchanged.");
  }

  function openAddFolderDialog() {
    setFolderName("");
    setFolderError("");
    addFolderDialogRef.current?.showModal();
    window.requestAnimationFrame(() => folderInputRef.current?.focus());
  }

  function handleAddFolder(event) {
    event.preventDefault();
    const name = folderName.trim();

    if (!name) {
      setFolderError("Enter a folder name.");
      return;
    }

    if (workspace.folders.length >= MAX_FOLDERS) {
      setFolderError(`This prototype supports up to ${MAX_FOLDERS} folders.`);
      return;
    }

    const folder = createFolder(name.slice(0, MAX_FOLDER_NAME));
    const draft = createThread(folder.id);
    setWorkspace((current) => ({
      ...current,
      folders: [...current.folders, folder],
      threads: limitThreads([...current.threads, draft], [draft.id]),
      activeFolderId: folder.id,
      activeThreadId: draft.id,
    }));
    setFocusComposer(true);
    setAnnouncement(`${folder.name} folder created.`);
    addFolderDialogRef.current?.close();
  }

  const storageLabel = storageStatus === "loading"
    ? "Loading saved chats"
    : storageStatus === "error"
      ? "History is not saving"
      : storageStatus === "saving"
        ? storageMode === "database"
          ? "Saving to client account"
          : "Saving on this device"
        : storageMode === "database"
          ? "Saved to client account"
          : "Saved on this device";
  const storageDescription = storageMode === "database"
    ? `Private workspace for ${clientProfile.name || "this client"}. Conversations reload on another signed-in device.`
    : "Browser-only prototype history. Clearing this site's data removes these chats.";
  const memoryLabel = storageMode === "database"
    ? `${knowledgeStats.approved} approved source${knowledgeStats.approved === 1 ? "" : "s"}`
    : "Browser demo";

  return (
    <section
      className={`app-shell assistant-workspace ${embedded ? "assistant-workspace--embedded" : ""}`}
      aria-label="AI chat workspace"
    >
      <aside className="sidebar">
        <div className="brand">
          <Image className="brand-logo" src={aocLogo} alt={config.company} />
        </div>

        <button
          className="sidebar-new-chat"
          type="button"
          onClick={() => createNewChat()}
          disabled={!hydrated}
        >
          <span aria-hidden="true">+</span>
          New chat
        </button>

        <nav className="workspace-navigation" aria-label="Chat workspace">
          <section className="navigation-section" aria-labelledby="folders-heading">
            <div className="navigation-heading">
              <h2 id="folders-heading">Folders</h2>
              <button
                className="icon-button"
                type="button"
                aria-label="Create folder"
                onClick={openAddFolderDialog}
                disabled={!hydrated}
              >
                +
              </button>
            </div>
            <FolderList
              folders={workspace.folders}
              activeFolderId={workspace.activeFolderId}
              threads={workspace.threads}
              onSelect={selectFolder}
              disabled={!hydrated}
            />
          </section>

          <section className="navigation-section history-section" aria-labelledby="chats-heading">
            <div className="navigation-heading">
              <h2 id="chats-heading">Chats</h2>
              <span>{visibleThreads.length}</span>
            </div>
            {hydrated ? (
              <HistoryList
                threads={visibleThreads}
                activeThreadId={workspace.activeThreadId}
                onSelect={selectThread}
                emptyMessage="No saved chats in this folder yet."
              />
            ) : (
              <div className="history-skeleton" aria-label="Loading saved chats">
                <i />
                <i />
                <i />
              </div>
            )}
          </section>
        </nav>

        <div
          className={`storage-note ${storageStatus === "error" ? "error" : ""}`}
          role="status"
          aria-live="polite"
        >
          <span className="storage-status">
            <i aria-hidden="true" /> {storageLabel}
          </span>
          <p>
            {storageDescription}
          </p>
          {storageWarning ? <p className="storage-warning">{storageWarning}</p> : null}
        </div>
      </aside>

      <section className="chat-panel">
        <header className="topbar">
          <div className="topbar-title">
            <p className="eyebrow">AOC client portal</p>
            <h1>{activeFolder?.name || config.name}</h1>
          </div>

          {embedded ? (
            <div className="embedded-conversation-controls">
              <label className="embedded-conversation-picker">
                <span className="embedded-history-icon" aria-hidden="true">
                  <svg viewBox="0 0 24 24" focusable="false">
                    <path d="M7 7.5h10M7 11.5h7M5.5 18.5l2.7-2.7H18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v10.5a2 2 0 0 0 1.5 2Z" />
                  </svg>
                </span>
                <span className="embedded-picker-copy">
                  <span>Conversation history</span>
                  <select
                    value={workspace.activeThreadId || ""}
                    onChange={(event) => selectThread(event.target.value)}
                    disabled={!hydrated || !activeThread}
                    aria-label="Switch conversation"
                  >
                    {!activeThread ? (
                      <option value="">Loading conversations...</option>
                    ) : null}
                    {conversationGroups.length === 1
                      ? conversationGroups[0].threads.map((thread) => (
                          <option key={thread.id} value={thread.id}>
                            {displayTitle(thread)}{thread.parentThreadId ? " (Branch)" : ""}
                          </option>
                        ))
                      : conversationGroups.map((folder) => (
                          <optgroup key={folder.id} label={folder.name}>
                            {folder.threads.map((thread) => (
                              <option key={thread.id} value={thread.id}>
                                {displayTitle(thread)}{thread.parentThreadId ? " (Branch)" : ""}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                  </select>
                </span>
              </label>
              <span className="embedded-history-count">
                {savedConversationCount} saved
              </span>
              <span
                className={`embedded-memory-status ${storageMode === "database" ? "connected" : ""}`}
                title={storageDescription}
              >
                <i aria-hidden="true" /> {memoryLabel}
              </span>
            </div>
          ) : (
            <div className="mobile-workspace-controls">
              <label>
                <span className="sr-only">Current folder</span>
                <select
                  value={workspace.activeFolderId}
                  onChange={(event) => selectFolder(event.target.value)}
                  disabled={!hydrated}
                >
                  {workspace.folders.map((folder) => (
                    <option key={folder.id} value={folder.id}>{folder.name}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                onClick={() => mobileHistoryDialogRef.current?.showModal()}
                disabled={!hydrated}
              >
                Chats
              </button>
            </div>
          )}

          <div className="connection-badge">
            <span aria-hidden="true" /> OpenAI API
          </div>
        </header>

        {hydrated && activeThread ? (
          <Chat
            key={activeThread.id}
            starters={config.starters}
            messages={activeThread.messages}
            onMessagesChange={(update) =>
              updateThreadMessages(activeThread.id, update)}
            onNewConversation={() => createNewChat(activeThread.folderId)}
            onBranch={(messageId) =>
              branchFromMessage(activeThread.id, messageId)}
            conversationTitle={displayTitle(activeThread)}
            folderName={activeFolder?.name || "General"}
            autoFocusComposer={focusComposer}
            models={models}
            modelsStatus={modelsStatus}
            modelsNotice={modelsNotice}
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
          />
        ) : (
          <div className="workspace-loading" role="status">
            <span className="assistant-avatar large" aria-hidden="true">
              <Image className="aoc-avatar-icon" src={aocIcon} alt="" />
            </span>
            <p>Loading your saved workspace…</p>
          </div>
        )}
      </section>

      <dialog
        className="folder-dialog"
        ref={addFolderDialogRef}
        aria-labelledby="folder-dialog-title"
      >
        <form onSubmit={handleAddFolder}>
          <div className="dialog-heading">
            <div>
              <p className="eyebrow">Organize chats</p>
              <h2 id="folder-dialog-title">Create a folder</h2>
            </div>
            <button
              className="dialog-close"
              type="button"
              aria-label="Close"
              onClick={() => addFolderDialogRef.current?.close()}
            >
              ×
            </button>
          </div>
          <label htmlFor="folder-name">Folder name</label>
          <input
            id="folder-name"
            ref={folderInputRef}
            value={folderName}
            onChange={(event) => {
              setFolderName(event.target.value);
              setFolderError("");
            }}
            maxLength={MAX_FOLDER_NAME}
            autoComplete="off"
            placeholder="Example: ChurchBanners"
            aria-invalid={folderError ? "true" : undefined}
            aria-describedby={folderError ? "folder-error folder-help" : "folder-help"}
          />
          {folderError ? (
            <p className="dialog-error" id="folder-error" role="alert">
              {folderError}
            </p>
          ) : null}
          <p className="dialog-help" id="folder-help">
            Folders organize this browser&apos;s chats. They do not provide client
            access control.
          </p>
          <div className="dialog-actions">
            <button
              className="secondary-button"
              type="button"
              onClick={() => addFolderDialogRef.current?.close()}
            >
              Cancel
            </button>
            <button className="primary-button" type="submit">Create folder</button>
          </div>
        </form>
      </dialog>

      <dialog
        className="mobile-history-dialog"
        ref={mobileHistoryDialogRef}
        aria-labelledby="mobile-history-title"
      >
        <div className="mobile-dialog-heading">
          <div>
            <p className="eyebrow">{activeFolder?.name || "Folder"}</p>
            <h2 id="mobile-history-title">Saved chats</h2>
          </div>
          <button
            type="button"
            aria-label="Close saved chats"
            onClick={() => mobileHistoryDialogRef.current?.close()}
          >
            ×
          </button>
        </div>
        <button
          className="mobile-new-chat"
          type="button"
          onClick={() => createNewChat()}
        >
          + New chat
        </button>
        <HistoryList
          threads={visibleThreads}
          activeThreadId={workspace.activeThreadId}
          onSelect={selectThread}
          emptyMessage="No saved chats in this folder yet."
        />
        <button
          className="mobile-add-folder"
          type="button"
          onClick={() => {
            mobileHistoryDialogRef.current?.close();
            window.requestAnimationFrame(openAddFolderDialog);
          }}
        >
          Create folder
        </button>
        <div
          className={`mobile-storage-label ${storageStatus === "error" ? "error" : ""}`}
          role="status"
          aria-live="polite"
        >
          <strong>{storageLabel}</strong>
          <p>
            {storageDescription}
          </p>
          {storageWarning ? <p>{storageWarning}</p> : null}
        </div>
      </dialog>

      <p className="sr-only" aria-live="polite">{announcement}</p>
    </section>
  );
}
