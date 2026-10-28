import { createHash } from "node:crypto";

// No keys, provider payloads or prompts are stored. Results are short-lived and
// scoped by provider + credential fingerprint + model, never just model name.
export function createModelAccessStore() {
  const entries = new Map();
  const scope = provider => createHash("sha256").update(`${provider.id}:${provider.apiKey}`).digest("hex");
  return {
    get(provider, model, now = Date.now()) {
      const key = `${scope(provider)}:${model}`;
      const entry = entries.get(key);
      if (!entry || now >= entry.expiresAt) { entries.delete(key); return null; }
      return entry.result;
    },
    set(provider, model, result, now = Date.now()) {
      if (entries.size >= 256) entries.delete(entries.keys().next().value);
      entries.set(`${scope(provider)}:${model}`, { result,
        expiresAt: now + (result.status === "temporary" ? 30_000 : 300_000) });
      return result;
    },
    clear(provider) {
      const prefix = `${scope(provider)}:`;
      for (const key of entries.keys()) if (key.startsWith(prefix)) entries.delete(key);
    },
  };
}

export const modelAccessStore = createModelAccessStore();

export function classifyModelAccessFailure(status, payload = {}) {
  const code = `${payload.error?.code || ""} ${payload.error?.type || ""}`.toLowerCase();
  const message = String(payload.error?.message || "").toLowerCase();
  const result = (state, reason) => ({ status: state, reason, checkedAt: Date.now() });
  if (payload.error?.metadata?.limit_source === "openrouter_in_flight_budget") {
    return result("temporary", "Provider in-flight budget is busy; refresh and retry later.");
  }
  if (status === 402 || /insufficient_quota|billing_hard_limit|billing_not_active|credit_balance|(?:organization|project)_(?:spend|usage)_limit/.test(code)) {
    return result("blocked", "API billing, credits or spending limit prevents this request. Check your provider dashboard.");
  }
  if (status === 401) return result("blocked", "The provider rejected this API key. Verify or replace the key.");
  if (status === 403) return result("blocked", "Access or account policy denied this request. Check project permissions and provider restrictions.");
  if (status === 404) return result("blocked", "Model or eligible provider endpoint is unavailable for this key.");
  if (status === 400 && /(?:tools?.*(?:not supported|unsupported)|(?:not supported|unsupported).*tools?|not supported.*responses)/.test(message)) {
    return result("blocked", "This model does not support the portal's required API/tool request.");
  }
  if (status === 429) return result("temporary", "Provider rate limit reached; refresh and retry later.");
  if (status >= 500 || status === 408) return result("temporary", "Provider is temporarily unavailable; refresh and retry later.");
  return result("temporary", "Access could not be confirmed. Check provider configuration and retry; no plan restriction was inferred.");
}

export async function probeModelAccess(provider, model, { fetcher = fetch, signal } = {}) {
  if (!["openai", "openrouter"].includes(provider.id) || !provider.apiKey || typeof model !== "string" || !model) {
    throw new TypeError("A validated provider and model are required for an access test.");
  }
  const parameters = { type: "object", properties: {}, required: [], additionalProperties: false };
  const tool = { name: "portal_connection_check", description: "A harmless connection check; no external actions.", parameters, strict: true };
  const router = provider.id === "openrouter";
  const body = router ? {
    model, messages: [{ role: "user", content: "Call portal_connection_check once." }], max_tokens: 128,
    tools: [{ type: "function", function: tool }],
    tool_choice: { type: "function", function: { name: tool.name } },
  } : {
    model, input: "Call portal_connection_check once.", max_output_tokens: 128, store: false,
    tools: [{ type: "function", ...tool }], tool_choice: { type: "function", name: tool.name },
  };
  try {
    const response = await fetcher(router ? "https://openrouter.ai/api/v1/chat/completions" : "https://api.openai.com/v1/responses", {
      method: "POST", headers: { ...provider.defaultHeaders, Authorization: `Bearer ${provider.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body), cache: "no-store", redirect: "error",
      signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(20_000)]) : AbortSignal.timeout(20_000),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.error) {
      return classifyModelAccessFailure(response.ok ? Number(payload.error?.code) || 500 : response.status, payload);
    }
    if ((router && Array.isArray(payload.choices) && payload.choices.length)
      || (!router && Array.isArray(payload.output) && ["completed", "incomplete"].includes(payload.status))) {
      return { status: "available", reason: "Provider accepted a small request with the required tool configuration.", checkedAt: Date.now() };
    }
    return classifyModelAccessFailure(502);
  } catch {
    return { status: "temporary", reason: "Connection timed out, was cancelled, or failed. Refresh and retry; account access is not yet confirmed.", checkedAt: Date.now() };
  }
}

export async function activateModelAfterAccessTest(provider, model, save, {
  probe = probeModelAccess, store = modelAccessStore, signal,
} = {}) {
  const access = await probe(provider, model, { signal });
  store.set(provider, model, access);
  if (access.status !== "available") return access;
  if (signal?.aborted) return { status: "temporary", reason: "Activation was cancelled; settings were not changed.", checkedAt: Date.now() };
  await save();
  return access;
}
