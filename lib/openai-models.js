import "server-only";

import OpenAI from "openai";
import { createHash } from "node:crypto";
import { resolveAiProvider } from "@/lib/ai-provider";
import { catalogAvailability, modelBlocked } from "./model-availability.js";

export const DEFAULT_MODEL = "gpt-5.4-mini";

const MODEL_CACHE_MS = 5 * 60 * 1000;
const MODEL_LIST_TIMEOUT_MS = 10000;
const TEXT_MODEL_FAMILY_PATTERN = /^(?:ft:)?(?:gpt-|chatgpt-|o\d(?:-|$))/i;
const SPECIALIZED_MODEL_PATTERN = /(?:audio|realtime|transcrib|speech|tts|whisper|image|sora|video|embedding|moderation|safety|search|codex|computer-use|deep-research|instruct|davinci|babbage)/i;

const catalogs = new Map();

export function getConfiguredModel() {
  return resolveAiProvider().model;
}

function isSupportedTextModel(model, providerId) {
  const modelId = model.id;
  if (providerId === "openrouter") {
    const outputModalities = model.architecture?.output_modalities;
    const returnsText = !Array.isArray(outputModalities) || outputModalities.includes("text");
    return returnsText && !SPECIALIZED_MODEL_PATTERN.test(modelId);
  }
  return TEXT_MODEL_FAMILY_PATTERN.test(modelId)
    && !SPECIALIZED_MODEL_PATTERN.test(modelId);
}

function labelForModel(modelId) {
  if (modelId === "openrouter/free") return "OpenRouter Free Router";
  if (modelId.includes("/")) {
    const [provider, ...nameParts] = modelId.replace(/:free$/i, "").split("/");
    const name = nameParts.join("/").replaceAll("-", " ");
    return `${provider} / ${name}${modelId.endsWith(":free") ? " (Free)" : " (Paid)"}`;
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

async function requestModelCatalog(provider) {
  if (!provider.apiKey) {
    throw new Error("An AI provider API key is not configured on the server.");
  }

  const openai = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL,
    defaultHeaders: provider.defaultHeaders, maxRetries: 0 });
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(new Error("Model list request timed out.")),
    MODEL_LIST_TIMEOUT_MS,
  );
  const availableModels = new Map();
  let userModelIds;

  try {
    const list = openai.models.list({ signal: controller.signal });

    for await (const model of list) {
      if (typeof model?.id !== "string") continue;

      availableModels.set(model.id, {
        id: model.id,
        created: Number.isFinite(model.created) ? model.created : 0,
        architecture: model.architecture,
        supported_parameters: model.supported_parameters,
        shutdown_date: model.shutdown_date,
        expiration_date: model.expiration_date,
        reasoning: model.reasoning,
      });
    }
    if (provider.id === "openrouter") {
      const response = await fetch("https://openrouter.ai/api/v1/models/user", {
        headers: { ...provider.defaultHeaders, Authorization: `Bearer ${provider.apiKey}` },
        cache: "no-store", redirect: "error", signal: controller.signal,
      });
      if (!response.ok) throw new Error("Could not verify account-filtered OpenRouter model access.");
      const payload = await response.json();
      if (!Array.isArray(payload.data)) throw new Error("Invalid account-filtered OpenRouter model list.");
      userModelIds = new Set(payload.data.map(model => model.id));
    }
  } finally {
    clearTimeout(timeout);
  }

  const configuredModel = provider.model;
  const textModels = [...availableModels.values()]
    .filter((model) => isSupportedTextModel(model, provider.id))
    .sort((first, second) => sortModels(first, second, configuredModel));
  const textModelIds = textModels.map((model) => model.id);
  const models = textModelIds.map((id) => ({
    id, label: labelForModel(id), reasoning: availableModels.get(id).reasoning,
    supportsTools: provider.id !== "openrouter" || id === "openrouter/free"
      || availableModels.get(id).supported_parameters?.includes("tools") === true,
    availability: catalogAvailability(availableModels.get(id), { allowed: !userModelIds || userModelIds.has(id) }),
  }));
  const eligible = models.filter(model => !modelBlocked(model));
  const defaultModel = eligible.find(model => model.id === configuredModel)?.id || eligible[0]?.id || null;
  return {
    verified: true,
    provider: provider.id,
    providerLabel: provider.label,
    defaultModel,
    models,
    fetchedAt: Date.now(),
  };
}

export async function getModelCatalog(provider = resolveAiProvider(), { fresh = false } = {}) {
  const key = createHash("sha256").update(`${provider.id}:${provider.apiKey}:${provider.model}`).digest("hex");
  const cached = catalogs.get(key);
  if (!fresh && cached && Date.now() - cached.time < MODEL_CACHE_MS) return cached.promise;
  if (catalogs.size >= 8) catalogs.delete(catalogs.keys().next().value);
  const entry = { time: Date.now(), promise: requestModelCatalog(provider) };
  catalogs.set(key, entry);
  entry.promise.catch(() => { if (catalogs.get(key) === entry) catalogs.delete(key); });
  return entry.promise;
}

export function getFallbackModelCatalog(provider = resolveAiProvider()) {
  const configuredModel = provider.model;

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
