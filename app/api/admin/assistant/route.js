import OpenAI from "openai";
import { recordAdminUsage } from "@/lib/portal-usage";
import { openaiIssue } from "@/lib/openai-issues";
import { consumeAdminResponse } from "@/lib/admin-response-stream";

import { ADMIN_ASSISTANT_INSTRUCTIONS } from "@/config/assistant";
import {
  adminErrorResponse,
  loadAdminAssistantClient,
  resolveAdminContext,
} from "@/lib/admin-data";
import {
  getFallbackModelCatalog,
  getModelCatalog,
  resolveRequestedModel,
} from "@/lib/openai-models";
import {
  assertTrustedOrigin,
  readJsonRequest,
  requestSecurityErrorResponse,
} from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGES = 40;
const MAX_MESSAGE_LENGTH = 12000;
const MAX_TOTAL_LENGTH = 50000;

function normalizeMessages(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one message is required.");
  }
  if (value.length > MAX_MESSAGES) {
    throw new Error("This admin conversation is too long. Start a new chat.");
  }

  const messages = value.map((message, index) => {
    const role = message?.role;
    const content = typeof message?.content === "string"
      ? message.content.trim()
      : "";

    if (role !== "user" && role !== "assistant") {
      throw new Error("Messages may only use user or assistant roles.");
    }
    if (!content || content.length > MAX_MESSAGE_LENGTH) {
      throw new Error(`Every message must contain 1-${MAX_MESSAGE_LENGTH} characters.`);
    }
    if (role !== (index % 2 === 0 ? "user" : "assistant")) {
      throw new Error("Conversation messages must alternate by role.");
    }
    return { role, content };
  });

  if (messages.at(-1)?.role !== "user") {
    throw new Error("The final message must come from the administrator.");
  }
  if (messages.reduce((total, message) => total + message.content.length, 0) > MAX_TOTAL_LENGTH) {
    throw new Error("This admin conversation is too long. Start a new chat.");
  }
  return messages;
}

function diagnostic(error, model) {
  return {
    provider: "openai",
    category: "openai_error",
    code: typeof error?.code === "string" ? error.code : "",
    httpStatus: Number.isInteger(error?.status) ? error.status : undefined,
    requestId: error?.request_id || error?._request_id || "",
    model,
  };
}

function streamHeaders() {
  return {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

async function catalogForRequest() {
  try {
    return await getModelCatalog();
  } catch (error) {
    console.error("Admin assistant model list failed", {
      name: error?.name,
      status: error?.status,
      code: error?.code,
      requestId: error?.request_id,
    });
    return getFallbackModelCatalog();
  }
}

export async function GET(request) {
  try {
    await resolveAdminContext(request.headers);
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY is not configured on the server." },
        { status: 503 },
      );
    }

    const catalog = await catalogForRequest();
    return Response.json(
      {
        defaultModel: catalog.defaultModel,
        models: catalog.models,
        verified: catalog.verified,
        notice: catalog.verified
          ? "Models returned by this server's OpenAI API key."
          : "Model access could not be verified. The configured server default is shown.",
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request) {
  let body;
  let messages;

  try {
    assertTrustedOrigin(request.headers);
    body = await readJsonRequest(request, 80_000);
    messages = normalizeMessages(body?.messages);
  } catch (error) {
    return requestSecurityErrorResponse(error) || Response.json(
      { error: error?.message || "The request body is invalid.", code: "invalid_request" },
      { status: 400 },
    );
  }

  try {
    await resolveAdminContext(request.headers);
    if (!process.env.OPENAI_API_KEY) {
      return Response.json(
        { error: "OPENAI_API_KEY is not configured on the server.", code: "openai_not_configured" },
        { status: 503 },
      );
    }

    const catalog = await catalogForRequest();
    let model;
    try {
      model = resolveRequestedModel(body?.model, catalog);
    } catch (error) {
      return Response.json({ error: error.message, code: "invalid_model" }, { status: 400 });
    }

    const selectedClient = await loadAdminAssistantClient(body?.clientSlug, request.headers);
    const clientContext = selectedClient
      ? [
          `Selected client: ${selectedClient.name} (${selectedClient.slug}).`,
          selectedClient.instructions
            ? `Approved client instructions:\n${selectedClient.instructions.slice(0, 12000)}`
            : "No approved client-specific instructions are connected.",
          selectedClient.vectorStoreId
            ? "An approved client-specific knowledge base is connected. Use file search when relevant."
            : "No client-specific file knowledge base is connected.",
        ].join("\n\n")
      : "No client is selected. Answer only from the administrator conversation and general AOC instructions.";

    const tools = selectedClient?.vectorStoreId
      ? [{
          type: "file_search",
          vector_store_ids: [selectedClient.vectorStoreId],
          max_num_results: 6,
        }]
      : [];

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY, maxRetries: 0 });
    const upstreamController = new AbortController();
    const timeout = setTimeout(() => {
      upstreamController.abort(new Error("Admin assistant request timed out."));
    }, 50_000);
    request.signal.addEventListener(
      "abort",
      () => upstreamController.abort(request.signal.reason),
      { once: true },
    );

    let result;
    const startedAt = new Date().toISOString();
    try {
      result = await openai.responses.create(
        {
          model,
          instructions: `${ADMIN_ASSISTANT_INSTRUCTIONS}\n\n${clientContext}`,
          input: messages,
          max_output_tokens: 1800,
          stream: true,
          store: false,
          ...(tools.length ? { tools } : {}),
        },
        { signal: upstreamController.signal },
      ).withResponse();
    } catch (error) {
      clearTimeout(timeout);
      await recordAdminUsage(startedAt, null, { code: openaiIssue(error).code, model });
      throw error;
    }

    const encoder = new TextEncoder();
    const sendLine = (controller, payload) => {
      controller.enqueue(encoder.encode(`${JSON.stringify(payload)}\n`));
    };
    const stream = new ReadableStream({
      async start(controller) {
        let usage = null;
        let failure = null;
        try {
          sendLine(controller, {
            type: "status",
            phase: "thinking",
            message: "Thinking...",
          });

          await consumeAdminResponse(result.data, {
            onUsage: value => { usage = value; },
            onDelta: delta => sendLine(controller, { type: "delta", delta }),
          });
        } catch (error) {
          failure = openaiIssue(error);
        } finally {
          clearTimeout(timeout);
          await recordAdminUsage(startedAt, usage, { code: failure?.code || "ready", model });
          try {
            sendLine(controller, failure
              ? { type: "error", message: failure.message, code: failure.code }
              : { type: "done", model, requestId: result.request_id || "" });
            controller.close();
          } catch {
            // The browser may have cancelled the stream already.
          }
        }
      },
    });

    return new Response(stream, { headers: streamHeaders() });
  } catch (error) {
    const model = typeof body?.model === "string" ? body.model.slice(0, 120) : "";
    console.error("Admin assistant request failed", diagnostic(error, model));
    if (error?.publicDetails) return adminErrorResponse(error);
    const issue = openaiIssue(error);
    return Response.json(
      {
        error: issue.message,
        code: issue.code,
        diagnostic: diagnostic(error, model),
      },
      { status: issue.httpStatus, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
