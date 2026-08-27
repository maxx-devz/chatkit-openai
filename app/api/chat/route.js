import OpenAI from "openai";

import { ASSISTANT_INSTRUCTIONS } from "@/config/assistant";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEFAULT_MODEL = "gpt-5.4-mini";
const MAX_MESSAGES = 30;
const MAX_MESSAGE_LENGTH = 12000;
const MAX_TOTAL_LENGTH = 60000;
const MAX_REQUEST_BYTES = 100000;
const MAX_OUTPUT_TOKENS = 2500;
const REQUEST_TIMEOUT_MS = 50000;

class RequestTooLargeError extends Error {}

async function readJsonBody(request) {
  const contentType = request.headers.get("content-type") || "";

  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new TypeError("Content-Type must be application/json.");
  }

  if (!request.body) {
    throw new TypeError("The request body is empty.");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new RequestTooLargeError("The request is too large.");
      }

      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;

  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return JSON.parse(new TextDecoder().decode(bytes));
}

function normalizeMessages(value) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("At least one message is required.");
  }

  if (value.length > MAX_MESSAGES) {
    throw new Error("This conversation is too long. Please start a new chat.");
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
      throw new Error(
        `Every message must contain 1-${MAX_MESSAGE_LENGTH} characters.`,
      );
    }

    const expectedRole = index % 2 === 0 ? "user" : "assistant";
    if (role !== expectedRole) {
      throw new Error("Conversation messages must alternate by role.");
    }

    return { role, content };
  });

  const totalLength = messages.reduce(
    (total, message) => total + message.content.length,
    0,
  );

  if (totalLength > MAX_TOTAL_LENGTH) {
    throw new Error("This conversation is too long. Please start a new chat.");
  }

  if (messages.at(-1)?.role !== "user") {
    throw new Error("The final message must come from the user.");
  }

  return messages;
}

function jsonLine(payload) {
  return `${JSON.stringify(payload)}\n`;
}

function logApiError(label, error) {
  console.error(label, {
    name: error?.name,
    status: error?.status,
    code: error?.code,
    requestId: error?.request_id,
  });
}

export async function POST(request) {
  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  let messages;

  try {
    const body = await readJsonBody(request);
    messages = normalizeMessages(body?.messages);
  } catch (error) {
    const status = error instanceof RequestTooLargeError
      ? 413
      : error instanceof TypeError
        ? 415
        : 400;

    return Response.json(
      { error: error.message || "The request body is invalid." },
      { status },
    );
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const upstreamController = new AbortController();
  const timeout = setTimeout(
    () => upstreamController.abort(new Error("OpenAI request timed out.")),
    REQUEST_TIMEOUT_MS,
  );
  request.signal.addEventListener(
    "abort",
    () => upstreamController.abort(request.signal.reason),
    { once: true },
  );
  let response;

  try {
    response = await openai.responses.create(
      {
        model: process.env.OPENAI_MODEL || DEFAULT_MODEL,
        instructions: ASSISTANT_INSTRUCTIONS,
        input: messages,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
        store: false,
      },
      { signal: upstreamController.signal },
    );
  } catch (error) {
    clearTimeout(timeout);
    logApiError("OpenAI request failed", error);
    return Response.json(
      { error: "The AI service is temporarily unavailable." },
      { status: 502 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let terminalEventSent = false;

      try {
        for await (const event of response) {
          if (event.type === "response.output_text.delta") {
            controller.enqueue(
              encoder.encode(jsonLine({ type: "delta", delta: event.delta })),
            );
          }

          if (
            event.type === "response.failed" ||
            event.type === "response.incomplete" ||
            event.type === "error"
          ) {
            logApiError("OpenAI response failed", event.response?.error || event);
            controller.enqueue(
              encoder.encode(
                jsonLine({
                  type: "error",
                  message: "The AI service could not complete the response.",
                }),
              ),
            );
            terminalEventSent = true;
            break;
          }

          if (event.type === "response.completed") {
            controller.enqueue(encoder.encode(jsonLine({ type: "done" })));
            terminalEventSent = true;
            break;
          }
        }

        if (!terminalEventSent && !upstreamController.signal.aborted) {
          controller.enqueue(
            encoder.encode(
              jsonLine({
                type: "error",
                message: "The AI response ended unexpectedly.",
              }),
            ),
          );
        }
      } catch (error) {
        if (error?.name !== "AbortError") {
          logApiError("OpenAI stream failed", error);
          controller.enqueue(
            encoder.encode(
              jsonLine({
                type: "error",
                message: "The response stream was interrupted.",
              }),
            ),
          );
        }
      } finally {
        clearTimeout(timeout);
        controller.close();
      }
    },
    cancel(reason) {
      clearTimeout(timeout);
      upstreamController.abort(reason);
      response.controller?.abort?.();
    },
  });

  return new Response(stream, {
    headers: {
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
