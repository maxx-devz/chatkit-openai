import "server-only";

import OpenAI from "openai";
import { aiClientOptions, resolveAiProvider } from "@/lib/ai-provider";

export const DEFAULT_MODEL = "gpt-5.4-mini";

const MODEL_CACHE_MS = 5 * 60 * 1000;
const MODEL_LIST_TIMEOUT_MS = 10000;
const TEXT_MODEL_FAMILY_PATTERN = /^(?:ft:)?(?:gpt-|chatgpt-|o\d(?:-|$))/i;
const SPECIALIZED_MODEL_PATTERN = /(?:audio|realtime|transcrib|speech|tts|whisper|image|sora|video|embedding|moderation|safety|search|codex|computer-use|deep-research|instruct|davinci|babbage)/i;

let cachedCatalog = null;
let catalogRequest = null;

export function getConfiguredModel() {
  return resolveAiProvider().model;
}

function isSupportedTextModel(model, providerId) {
  const modelId = model.id;
  if (providerId === "openrouter") {
    const isFree = modelId === "openrouter/free" || modelId.endsWith(":free");
    const outputModalities = model.architecture?.output_modalities;
    const returnsText = !Array.isArray(outputModalities) || outputModalities.includes("text");
    return isFree && returnsText && !SPECIALIZED_MODEL_PATTERN.test(modelId);
  }
  return TEXT_MODEL_FAMILY_PATTERN.test(modelId)
    && !SPECIALIZED_MODEL_PATTERN.test(modelId);
}

function labelForModel(modelId) {
  if (modelId === "openrouter/free") return "OpenRouter Free Router";
  if (modelId.includes("/")) {
    const [provider, ...nameParts] = modelId.replace(/:free$/i, "").split("/");
    const name = nameParts.join("/").replaceAll("-", " ");
    return `${provider} / ${name} (Free)`;
  }
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
  const provider = resolveAiProvider();
  if (!provider.apiKey) {
    throw new Error("An AI provider API key is not configured on the server.");
  }

  const openai = new OpenAI(aiClientOptions());
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
        architecture: model.architecture,
      });
    }
  } finally {
    clearTimeout(timeout);
  }

  const configuredModel = getConfiguredModel();
  const textModels = [...availableModels.values()]
    .filter((model) => isSupportedTextModel(model, provider.id))
    .sort((first, second) => sortModels(first, second, configuredModel));
  const textModelIds = textModels.map((model) => model.id);
  const defaultModel = availableModels.has(configuredModel)
    && isSupportedTextModel(availableModels.get(configuredModel), provider.id)
    ? configuredModel
    : textModelIds[0] || null;
  return {
    verified: true,
    provider: provider.id,
    providerLabel: provider.label,
    defaultModel,
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
  const provider = resolveAiProvider();
  const configuredModel = getConfiguredModel();

  return {
    verified: false,
    provider: provider.id,
    providerLabel: provider.label,
    defaultModel: configuredModel,
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
