import "server-only";

import { randomUUID } from "node:crypto";

const MAKE_WEBHOOK_HOST = /^hook(?:\.[a-z0-9-]+)?\.make\.com$/i;
const RESPONSE_LIMIT = 4_000;

class MakeWebhookError extends Error {
  constructor(code, message, status) {
    super(message);
    this.publicDetails = { code, message, status };
  }
}

function configuredWebhookUrl(value) {
  if (!value) {
    throw new MakeWebhookError(
      "make_not_configured",
      "The Make webhook is not configured on this portal environment.",
      503,
    );
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !MAKE_WEBHOOK_HOST.test(url.hostname)) {
      throw new Error("unsupported webhook origin");
    }
    return url;
  } catch {
    throw new MakeWebhookError(
      "make_configuration_invalid",
      "The configured Make webhook URL is invalid.",
      503,
    );
  }
}

function safeResponseMessage(value) {
  const text = String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").trim();
  if (!text) return "Make accepted the connection test.";
  return text.slice(0, 200);
}

function confirmedScenarioResponse(value) {
  let payload;
  try {
    payload = JSON.parse(value);
  } catch {
    payload = null;
  }

  if (payload?.success !== true || payload?.event !== "portal.connection_test") {
    throw new MakeWebhookError(
      "make_execution_unconfirmed",
      "Make received the test but did not confirm scenario execution. Enable the scenario and check its Webhook response module.",
      502,
    );
  }

  return safeResponseMessage(payload.message || "Make confirmed the connection test.");
}

export async function sendMakeConnectionTest({
  fetchImpl = fetch,
  now = () => new Date(),
  createId = randomUUID,
  webhookUrl = process.env.MAKE_WEBHOOK_URL,
  environment = process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
} = {}) {
  const url = configuredWebhookUrl(webhookUrl);
  const requestId = createId();
  const sentAt = now().toISOString();
  const event = {
    event: "portal.connection_test",
    version: 1,
    source: "aoc-portal",
    environment,
    requestId,
    sentAt,
    initiatedBy: "administrator",
  };

  let response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(event),
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new MakeWebhookError(
      "make_unavailable",
      "The portal could not reach Make. Check the webhook and try again.",
      502,
    );
  }

  let responseText = "";
  try {
    responseText = (await response.text()).slice(0, RESPONSE_LIMIT);
  } catch {
    throw new MakeWebhookError(
      "make_invalid_response",
      "Make returned an unreadable response.",
      502,
    );
  }

  if (!response.ok) {
    throw new MakeWebhookError(
      "make_rejected",
      `Make rejected the connection test with HTTP ${response.status}.`,
      502,
    );
  }

  return {
    connected: true,
    requestId,
    sentAt,
    message: confirmedScenarioResponse(responseText),
  };
}

export function makeWebhookErrorResponse(error) {
  if (!(error instanceof MakeWebhookError)) return null;
  return Response.json(
    {
      error: error.publicDetails.message,
      code: error.publicDetails.code,
    },
    {
      status: error.publicDetails.status,
      headers: { "Cache-Control": "private, no-store" },
    },
  );
}
