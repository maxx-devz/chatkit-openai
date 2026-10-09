const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";
const OPENROUTER_KEY_PREFIX = "sk-or-v1-";

export const OPENAI_DEFAULT_MODEL = "gpt-6-luna";
export const OPENROUTER_DEFAULT_MODEL = "openrouter/free";

function value(environment, name) {
  return typeof environment?.[name] === "string"
    ? environment[name].trim()
    : "";
}

export function isOpenRouterKey(apiKey) {
  return typeof apiKey === "string"
    && apiKey.trim().startsWith(OPENROUTER_KEY_PREFIX);
}

export function resolveAiProvider(environment = process.env) {
  const dedicatedOpenRouterKey = value(environment, "OPENROUTER_API_KEY");
  const legacyKey = value(environment, "OPENAI_API_KEY");
  const usesOpenRouter = Boolean(dedicatedOpenRouterKey) || isOpenRouterKey(legacyKey);
  const apiKey = usesOpenRouter ? dedicatedOpenRouterKey || legacyKey : legacyKey;
  const legacyModel = value(environment, "OPENAI_MODEL");
  const openRouterModel = value(environment, "OPENROUTER_MODEL");
  const model = usesOpenRouter
    ? openRouterModel
      || (legacyModel.includes("/") ? legacyModel : "")
      || OPENROUTER_DEFAULT_MODEL
    : legacyModel || OPENAI_DEFAULT_MODEL;
  const siteUrl = value(environment, "OPENROUTER_SITE_URL")
    || value(environment, "BETTER_AUTH_URL");
  const appName = value(environment, "OPENROUTER_APP_NAME")
    || "Always Open Commerce Portal";
  const defaultHeaders = {};

  if (usesOpenRouter) {
    try {
      const parsed = new URL(siteUrl);
      if (["http:", "https:"].includes(parsed.protocol)) {
        defaultHeaders["HTTP-Referer"] = parsed.origin;
      }
    } catch {
      // OpenRouter attribution headers are optional.
    }
    defaultHeaders["X-OpenRouter-Title"] = appName.slice(0, 120);
  }

  return {
    id: usesOpenRouter ? "openrouter" : "openai",
    label: usesOpenRouter ? "OpenRouter" : "OpenAI",
    apiKey,
    baseURL: usesOpenRouter ? OPENROUTER_BASE_URL : undefined,
    defaultHeaders,
    model,
    supportsOpenAiHostedTools: !usesOpenRouter,
  };
}

export function aiClientOptions(environment = process.env, overrides = {}) {
  const provider = resolveAiProvider(environment);
  return {
    apiKey: provider.apiKey,
    ...(provider.baseURL ? { baseURL: provider.baseURL } : {}),
    ...(Object.keys(provider.defaultHeaders).length
      ? { defaultHeaders: provider.defaultHeaders }
      : {}),
    ...overrides,
  };
}
