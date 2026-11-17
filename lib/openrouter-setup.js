// Metadata checks only: never generate a test reply, return keys, or change account policy.
export class OpenRouterSetupError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.name = "OpenRouterSetupError";
    this.status = status;
  }
}

export function isOpenRouterFreeModel(id) {
  return typeof id === "string" && (id === "openrouter/free" || id.endsWith(":free"));
}

function nonnegative(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export function openRouterAccountSummary(data, now = Date.now()) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new OpenRouterSetupError("OpenRouter returned invalid key information. Please retry.");
  }
  const expires = typeof data.expires_at === "string" ? Date.parse(data.expires_at) : NaN;
  if (Number.isFinite(expires) && expires <= now) {
    throw new OpenRouterSetupError("This OpenRouter key has expired. Create a replacement in OpenRouter and save it here.");
  }
  if (data.disabled === true) throw new OpenRouterSetupError("This OpenRouter key is disabled. Review it in OpenRouter settings.");
  const daily = data.free_model_daily_requests;
  return {
    keyVerified: true,
    isFreeTier: typeof data.is_free_tier === "boolean" ? data.is_free_tier : null,
    freeRequests: {
      used: nonnegative(daily?.used), limit: nonnegative(daily?.limit), remaining: nonnegative(daily?.remaining),
    },
    // This is the key's spending cap, NOT the account's cash balance.
    keyLimitRemainingUsd: nonnegative(data.limit_remaining),
    checkedAt: now,
    generationTested: false,
  };
}

export async function checkOpenRouterAccount(provider, { fetchImpl = fetch } = {}) {
  const response = await fetchImpl("https://openrouter.ai/api/v1/key", {
    headers: { Authorization: `Bearer ${provider.apiKey}` }, cache: "no-store", redirect: "error",
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    const message = response.status === 429 ? "OpenRouter temporarily limited connection checks. Wait a moment and refresh."
      : [401, 403].includes(response.status) ? "OpenRouter rejected this key. Check that it is active and belongs to the intended account."
      : "OpenRouter could not check this connection. Please retry shortly.";
    throw new OpenRouterSetupError(message, response.status === 429 ? 429 : 400);
  }
  const payload = await response.json();
  return openRouterAccountSummary(payload.data);
}

export function openRouterModelDetails(model) {
  const pricing = model.pricing;
  const zero = value => (typeof value === "string" && value.trim() !== "" || typeof value === "number")
    && Number.isFinite(Number(value)) && Number(value) === 0;
  return {
    free: isOpenRouterFreeModel(model.id),
    zeroPriced: Boolean(pricing && zero(pricing.prompt) && zero(pricing.completion)
      && Object.values(pricing).every(zero)),
    contextLength: nonnegative(model.context_length),
    supportsTools: model.supported_parameters?.includes("tools") === true,
  };
}

export function constrainFreeRouter(models) {
  const hasCandidate = models.some(model => model.id !== "openrouter/free" && model.free
    && model.supportsTools && model.availability?.status !== "blocked");
  return models.map(model => model.id === "openrouter/free" && !hasCandidate ? {
    ...model, availability: { status: "blocked",
      reason: "No account-allowed free tool-capable model was listed. Review OpenRouter privacy settings or choose another model." },
  } : model);
}

export function visibleProviderModels(models, { freeOnly = false, query = "" } = {}) {
  const term = query.trim().toLowerCase();
  return models.filter(model => (!freeOnly || model.free === true)
    && (!term || `${model.id} ${model.label}`.toLowerCase().includes(term)));
}
