const STORAGE_VERSION = 1;
const MAX_FOLDERS = 30;
const MAX_THREADS = 150;
const MAX_MESSAGES_PER_THREAD = 100;
const MAX_FOLDER_NAME = 60;
const MAX_TITLE_LENGTH = 72;
const MAX_MESSAGE_LENGTH = 12000;
const MAX_ID_LENGTH = 160;
const MAX_ASSETS = 4;

function cleanString(value, maxLength) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function cleanTimestamp(value) {
  return Number.isSafeInteger(value) && value >= 0
    ? value
    : Date.now();
}

function sanitizeAssets(value) {
  if (!Array.isArray(value)) return [];

  return value.slice(0, MAX_ASSETS).flatMap((asset) => {
    const id = cleanString(asset?.id, MAX_ID_LENGTH);
    const filename = cleanString(asset?.filename, 180);
    const mimeType = cleanString(asset?.mimeType, 80);
    const localAsset = cleanString(asset?.localAsset, 40);

    if (
      !id
      || asset?.kind !== "image"
      || !filename
      || !mimeType.startsWith("image/")
      || (localAsset && !["aoc-logo", "aoc-icon"].includes(localAsset))
    ) {
      return [];
    }

    return [{
      id,
      kind: "image",
      filename,
      mimeType,
      alt: cleanString(asset?.alt, 180) || "Generated image",
      ...(localAsset ? { localAsset } : {}),
    }];
  });
}

function sanitizeUsage(value) {
  if (!value || typeof value !== "object") return null;
  const fields = ["inputTokens", "outputTokens", "totalTokens"];

  if (!fields.every((field) => Number.isSafeInteger(value[field]) && value[field] >= 0)) {
    return null;
  }

  return Object.fromEntries(fields.map((field) => [field, value[field]]));
}

function sanitizeDiagnostic(value) {
  if (!value || typeof value !== "object") return null;
  const result = {
    provider: cleanString(value.provider, 80),
    category: cleanString(value.category, 80),
    stage: cleanString(value.stage, 120),
    code: cleanString(value.code, 120),
    requestId: cleanString(value.requestId, 180),
    model: cleanString(value.model, 120),
    imageModel: cleanString(value.imageModel, 120),
    ...(Number.isInteger(value.httpStatus)
      && value.httpStatus >= 100
      && value.httpStatus <= 599
      ? { httpStatus: value.httpStatus }
      : {}),
  };

  return Object.values(result).some(Boolean) ? result : null;
}

function sanitizeMessages(value) {
  if (!Array.isArray(value)) return [];
  const messages = [];
  const messageIds = new Set();

  for (const candidate of value.slice(0, MAX_MESSAGES_PER_THREAD)) {
    const expectedRole = messages.length % 2 === 0 ? "user" : "assistant";
    if (candidate?.role !== expectedRole) break;

    const id = cleanString(candidate?.id, MAX_ID_LENGTH);
    if (!id || messageIds.has(id)) break;
    messageIds.add(id);

    const status = candidate.role === "assistant"
      && ["streaming", "completed", "stopped", "failed"].includes(candidate.status)
      ? candidate.status
      : "completed";
    const content = cleanString(candidate?.content, MAX_MESSAGE_LENGTH);

    if (!content && !(candidate.role === "assistant" && status !== "completed")) {
      break;
    }

    const assets = sanitizeAssets(candidate.assets);
    const usage = sanitizeUsage(candidate.usage);
    const diagnostic = sanitizeDiagnostic(candidate.diagnostic);

    messages.push({
      id,
      role: candidate.role,
      content,
      status,
      ...(cleanString(candidate.modelId, 100)
        ? { modelId: cleanString(candidate.modelId, 100) }
        : {}),
      ...(cleanString(candidate.originMessageId, MAX_ID_LENGTH)
        ? { originMessageId: cleanString(candidate.originMessageId, MAX_ID_LENGTH) }
        : {}),
      ...(cleanString(candidate.errorMessage, 500)
        ? { errorMessage: cleanString(candidate.errorMessage, 500) }
        : {}),
      ...(assets.length ? { assets } : {}),
      ...(usage ? { usage } : {}),
      ...(diagnostic ? { diagnostic } : {}),
    });
  }

  return messages;
}

export function sanitizeWorkspace(value) {
  if (!value || typeof value !== "object" || value.version !== STORAGE_VERSION) {
    throw new Error("The workspace format is not supported.");
  }

  const folders = [];
  const folderIds = new Set();

  for (const candidate of Array.isArray(value.folders)
    ? value.folders.slice(0, MAX_FOLDERS)
    : []) {
    const id = cleanString(candidate?.id, MAX_ID_LENGTH);
    const name = cleanString(candidate?.name, MAX_FOLDER_NAME);
    if (!id || !name || folderIds.has(id)) continue;

    folderIds.add(id);
    folders.push({ id, name, createdAt: cleanTimestamp(candidate.createdAt) });
  }

  if (!folders.length) throw new Error("The workspace must contain a folder.");

  const threads = [];
  const threadIds = new Set();

  for (const candidate of Array.isArray(value.threads)
    ? value.threads.slice(0, MAX_THREADS)
    : []) {
    const id = cleanString(candidate?.id, MAX_ID_LENGTH);
    const folderId = cleanString(candidate?.folderId, MAX_ID_LENGTH);
    if (!id || threadIds.has(id) || !folderIds.has(folderId)) continue;

    threadIds.add(id);
    const createdAt = cleanTimestamp(candidate.createdAt);
    const updatedAt = Math.max(createdAt, cleanTimestamp(candidate.updatedAt));
    threads.push({
      id,
      folderId,
      title: cleanString(candidate.title, MAX_TITLE_LENGTH),
      messages: sanitizeMessages(candidate.messages),
      createdAt,
      updatedAt,
      parentThreadId: cleanString(candidate.parentThreadId, MAX_ID_LENGTH) || null,
      branchedFromMessageId:
        cleanString(candidate.branchedFromMessageId, MAX_ID_LENGTH) || null,
    });
  }

  const activeFolderId = cleanString(value.activeFolderId, MAX_ID_LENGTH);
  const activeThreadId = cleanString(value.activeThreadId, MAX_ID_LENGTH);

  if (!folderIds.has(activeFolderId)) {
    throw new Error("The active folder is invalid.");
  }

  if (activeThreadId && !threadIds.has(activeThreadId)) {
    throw new Error("The active conversation is invalid.");
  }

  return {
    version: STORAGE_VERSION,
    folders,
    threads,
    activeFolderId,
    activeThreadId: activeThreadId || null,
  };
}
