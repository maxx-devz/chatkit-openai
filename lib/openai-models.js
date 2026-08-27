import "server-only";

import OpenAI from "openai";

export const DEFAULT_MODEL = "gpt-5.4-mini";

const MODEL_CACHE_MS = 5 * 60 * 1000;
const MODEL_LIST_TIMEOUT_MS = 10000;
const TEXT_MODEL_FAMILY_PATTERN = /^(?:ft:)?(?:gpt-|chatgpt-|o\d(?:-|$))/i;
const SPECIALIZED_MODEL_PATTERN = /(?:audio|realtime|transcrib|speech|tts|whisper|image|sora|video|embedding|moderation|search|codex|computer-use|deep-research|instruct|davinci|babbage)/i;
const IMAGE_MODEL_PATTERN = /^(?:gpt-image-|chatgpt-image-)/i;

let cachedCatalog = null;
let catalogRequest = null;

export function getConfiguredModel() {
  return process.env.OPENAI_MODEL?.trim() || DEFAULT_MODEL;
}

function isSupportedTextModel(modelId) {
  return TEXT_MODEL_FAMILY_PATTERN.test(modelId)
    && !SPECIALIZED_MODEL_PATTERN.test(modelId);
}

function labelForModel(modelId) {
  return modelId
    .replace(/^gpt-/i, "GPT ")
    .replace(/^chatgpt-/i, "ChatGPT ")
    .replaceAll("-", " ")
    .replace(/\b(mini|nano|latest|preview|pro)\b/gi, (name) =>
      `${name[0].toUpperCase()}${name.slice(1).toLowerCase()}`,
    );
}

function sortModels(first, second, configuredModel) {
  if (first.id === configuredModel) return -1;
  if (second.id === configuredModel) return 1;

  return second.created - first.created || first.id.localeCompare(second.id);
}

async function requestModelCatalog() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Model list request timed out.")),
    MODEL_LIST_TIMEOUT_MS,
  );
  const availableModels = new Map();

  try {
    const list = openai.models.list({ signal: controller.signal });

    for await (const model of list) {
      if (typeof model?.id !== "string") continue;

      availableModels.set(model.id, {
        id: model.id,
        created: Number.isFinite(model.created) ? model.created : 0,
      });
    }
  } finally {
    clearTimeout(timeout);
  }

  const configuredModel = getConfiguredModel();
  const textModels = [...availableModels.values()]
    .filter((model) => isSupportedTextModel(model.id))
    .sort((first, second) => sortModels(first, second, configuredModel));
  const textModelIds = textModels.map((model) => model.id);
  const defaultModel = availableModels.has(configuredModel)
    && isSupportedTextModel(configuredModel)
    ? configuredModel
    : textModelIds[0] || null;
  const imageModel = [...availableModels.values()]
    .filter((model) => IMAGE_MODEL_PATTERN.test(model.id))
    .sort((first, second) => sortModels(first, second, ""))[0]?.id || null;

  return {
    verified: true,
    defaultModel,
    imageModel,
    models: textModelIds.map((id) => ({
      id,
      label: labelForModel(id),
    })),
    fetchedAt: Date.now(),
  };
}

export async function getModelCatalog() {
  if (
    cachedCatalog
    && Date.now() - cachedCatalog.fetchedAt < MODEL_CACHE_MS
  ) {
    return cachedCatalog;
  }

  if (!catalogRequest) {
    catalogRequest = requestModelCatalog()
      .then((catalog) => {
        cachedCatalog = catalog;
        return catalog;
      })
      .finally(() => {
        catalogRequest = null;
      });
  }

  return catalogRequest;
}

export function getFallbackModelCatalog() {
  const configuredModel = getConfiguredModel();

  return {
    verified: false,
    defaultModel: configuredModel,
    imageModel: null,
    models: [{ id: configuredModel, label: labelForModel(configuredModel) }],
    fetchedAt: Date.now(),
  };
}

export function resolveRequestedModel(requestedModel, catalog) {
  const normalizedRequest = typeof requestedModel === "string"
    ? requestedModel.trim()
    : "";
  const modelId = normalizedRequest || catalog.defaultModel || getConfiguredModel();

  if (!catalog.models.some((model) => model.id === modelId)) {
    throw new Error("The selected model is not available to this API key.");
  }

  return modelId;
}
