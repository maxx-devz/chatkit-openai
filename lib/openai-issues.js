export const OPENAI_BILLING_URL = "https://platform.openai.com/settings/organization/billing/overview";

const issues = {
  credit_balance_exhausted: {
    title: "OpenAI credits exhausted",
    message: "OpenAI blocked this request because the API account has no available credits. Add API credits in OpenAI billing, then retry. Increasing the portal allowance will not resolve this.",
    billing: true, retryLabel: "Retry after adding credits", httpStatus: 429,
  },
  insufficient_quota: {
    title: "OpenAI API quota or billing limit reached",
    message: "OpenAI blocked this request because an API quota or billing limit was reached. Check available credits and usage limits in OpenAI, then retry. ChatGPT Business does not fund API requests.",
    billing: true, retryLabel: "Retry after checking billing", httpStatus: 429,
  },
  rate_limit_exceeded: {
    title: "Temporary OpenAI rate limit",
    message: "OpenAI received too many requests or tokens in a short time. Wait briefly, then retry. This response does not confirm that your credits are exhausted.",
    retryLabel: "Retry request", httpStatus: 429,
  },
  authentication_failed: {
    title: "OpenAI API credentials need attention",
    message: "OpenAI rejected the server's API credentials. Check the configured API key and its permissions, then retry.",
    retryLabel: "Retry after updating credentials", httpStatus: 503,
  },
  model_unavailable: {
    title: "OpenAI model access unavailable",
    message: "The API project cannot access this model or resource. Check its permissions or choose an available model, then retry.",
    retryLabel: "Retry after checking access", httpStatus: 503,
  },
  output_limit: {
    title: "Reply reached its output limit",
    message: "The reply stopped at its output limit. Ask for a shorter answer or retry. This is not an API billing limit.",
    retryLabel: "Retry response", httpStatus: 502,
  },
  response_incomplete: {
    title: "Reply was interrupted",
    message: "The reply ended before OpenAI confirmed completion. Any partial answer remains visible. Please retry.",
    retryLabel: "Retry response", httpStatus: 502,
  },
  request_failed: {
    title: "OpenAI request could not finish",
    message: "The request could not finish. Try again; if it persists, check the server connection and OpenAI service status.",
    retryLabel: "Retry response", httpStatus: 502,
  },
};

export function openaiIssue(error) {
  let code = error?.code || error?.error?.code || error?.body?.error?.code;
  const status = error?.status || error?.status_code;
  if (["billing_hard_limit_reached", "billing_not_active"].includes(code)) code = "insufficient_quota";
  if (!Object.hasOwn(issues, code)) {
    if (status === 429) code = "rate_limit_exceeded";
    else if (status === 401 || code === "invalid_api_key") code = "authentication_failed";
    else if (status === 403 || status === 404 || code === "model_not_found") code = "model_unavailable";
    else code = "request_failed";
  }
  // Only curated messages reach the browser or database; provider errors can
  // contain credentials, internal resource identifiers, or user input.
  return { code, billing: false, ...issues[code] };
}

export function providerStatus(code) {
  if (code === "ready") return { code, title: "Last API request succeeded", message: "The last recorded request completed. This does not guarantee credit availability for the next request." };
  if (!code) return { code: "unknown", title: "API access not checked yet", message: "Send an admin assistant request to record its result. Loading a model list does not check billing." };
  return openaiIssue({ code });
}
