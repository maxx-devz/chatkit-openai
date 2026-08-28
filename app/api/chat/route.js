import OpenAI from "openai";

import { ASSISTANT_INSTRUCTIONS } from "@/config/assistant";
import {
  getFallbackModelCatalog,
  getModelCatalog,
  resolveRequestedModel,
} from "@/lib/openai-models";
import {
  getPortalAiContext,
  portalErrorResponse,
  recordPortalAiTokens,
  reservePortalAiRequest,
} from "@/lib/portal-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MAX_MESSAGES = 99;
const MAX_MESSAGE_LENGTH = 12000;
const MAX_TOTAL_LENGTH = 60000;
const MAX_REQUEST_BYTES = 100000;
const MAX_OUTPUT_TOKENS = 2500;
const REQUEST_TIMEOUT_MS = 50000;
const IMAGE_REQUEST_PATTERN = /(?:\b(?:generate|create|make|draw|design|render|produce)\b[\s\S]{0,100}\b(?:image|picture|illustration|logo|graphic|photo|icon)\b|\b(?:image|picture|illustration|logo|graphic|photo|icon)\b[\s\S]{0,100}\b(?:generate|create|make|draw|design|render|produce)\b)/i;
const OFFICIAL_ASSET_OWNER_PATTERN = /(?:\b(?:aoc|always open commerce)\b|\b(?:your|yours|our|official|main)\b[\s\S]{0,40}\b(?:logo|icon)\b|\b(?:logo|icon)\b[\s\S]{0,40}\b(?:yours|official)\b)/i;
const BRAND_ASSET_REDESIGN_PATTERN = /\b(?:new|redesign|rebrand|variation|alternative|different|concept)\b/i;
const BRAND_ASSET_FOLLOW_UP_PATTERN = /^\s*(?:and\s+)?(?:how|what)\s+about\s+(?:the\s+)?(?:logo|icon)\s*[?.!]*\s*$/i;
const APPROVED_BRAND_ASSETS = {
  "aoc-logo": {
    id: "aoc-official-logo",
    filename: "aoc-logo.png",
    alt: "Always Open Commerce logo",
    label: "logo",
  },
  "aoc-icon": {
    id: "aoc-official-icon",
    filename: "aoc-icon.png",
    alt: "Always Open Commerce icon",
    label: "icon",
  },
};

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

function streamHeaders() {
  return {
    "Cache-Control": "no-cache, no-store, must-revalidate",
    "Content-Type": "application/x-ndjson; charset=utf-8",
    "X-Content-Type-Options": "nosniff",
  };
}

function ndjsonResponse(events) {
  return new Response(events.map(jsonLine).join(""), {
    headers: streamHeaders(),
  });
}

function logApiError(label, error, diagnostic = {}) {
  console.error(label, {
    name: error?.name,
    status: error?.status,
    code: error?.code,
    requestId: diagnostic.requestId || error?.request_id,
    category: diagnostic.category,
    stage: diagnostic.stage,
  });
}

function openAIErrorDetails(error, context = {}) {
  const status = error?.status || error?.response?.status;
  const code = error?.code || error?.error?.code;
  const message = error?.message || error?.error?.message || "";
  const requestId = context.requestId
    || error?.request_id
    || error?._request_id
    || "";
  let category = "openai_error";
  let publicMessage = "The OpenAI API could not complete this response. Please try again.";

  if (status === 401 || code === "invalid_api_key") {
    category = "authentication";
    publicMessage = "OpenAI rejected the server API key. Replace it with a valid project key.";
  } else if (
    code === "insufficient_quota"
    || /exceeded your current quota|insufficient quota|billing|credit balance/i.test(message)
  ) {
    category = "insufficient_quota";
    publicMessage = "OpenAI reported insufficient API quota or billing credit for this project. ChatGPT subscriptions do not provide API credit.";
  } else if (code === "rate_limit_exceeded") {
    category = "rate_limit";
    publicMessage = "OpenAI temporarily rate-limited this API project. Wait briefly, then try again.";
  } else if (status === 429) {
    category = "http_429";
    publicMessage = "OpenAI returned HTTP 429. This may be a temporary rate limit or a project quota issue; check the technical details below.";
  } else if (
    status === 403
    || code === "model_not_found"
    || /verification|not have access|permission/i.test(message)
  ) {
    category = "access_denied";
    publicMessage = "This OpenAI API project does not have access to the selected model or image-generation tool.";
  } else if (code === "image_content_policy_violation") {
    category = "image_policy";
    publicMessage = "OpenAI could not generate this image because the request did not pass the image safety policy.";
  } else if (status >= 500 || code === "server_error") {
    category = "openai_server_error";
    publicMessage = "OpenAI had a temporary server problem while processing this request. Please try again.";
  }

  return {
    message: publicMessage,
    diagnostic: {
      provider: "OpenAI API",
      category,
      stage: context.stage || "Processing request",
      ...(Number.isInteger(status) ? { httpStatus: status } : {}),
      ...(typeof code === "string" && code ? { code: code.slice(0, 120) } : {}),
      ...(typeof requestId === "string" && requestId
        ? { requestId: requestId.slice(0, 180) }
        : {}),
      ...(context.selectedModel
        ? { model: context.selectedModel.slice(0, 120) }
        : {}),
      ...(context.imageModel
        ? { imageModel: context.imageModel.slice(0, 120) }
        : {}),
    },
  };
}

function isImageRequest(messages) {
  return IMAGE_REQUEST_PATTERN.test(messages.at(-1)?.content || "");
}

function requestedApprovedBrandAsset(messages) {
  const prompt = messages.at(-1)?.content || "";
  const assetKey = /\bicon\b/i.test(prompt)
    ? "aoc-icon"
    : /\blogo\b/i.test(prompt)
      ? "aoc-logo"
      : "";

  if (!assetKey || BRAND_ASSET_REDESIGN_PATTERN.test(prompt)) return "";

  const hasExplicitOwner = OFFICIAL_ASSET_OWNER_PATTERN.test(prompt);
  const isContextualFollowUp = BRAND_ASSET_FOLLOW_UP_PATTERN.test(prompt)
    && messages.slice(0, -1).slice(-4).some((message) =>
      /\b(?:aoc|always open commerce|official)\b/i.test(message?.content || ""),
    );

  return hasExplicitOwner || isContextualFollowUp ? assetKey : "";
}

function approvedBrandAssetResponse(assetKey) {
  const asset = APPROVED_BRAND_ASSETS[assetKey];

  return ndjsonResponse([
    {
      type: "status",
      phase: "using_approved_asset",
      message: "Loading the approved AOC brand asset...",
    },
    {
      type: "delta",
      delta: `Here is the official Always Open Commerce ${asset.label} used by this portal.`,
    },
    {
      type: "asset",
      asset: {
        id: asset.id,
        kind: "image",
        filename: asset.filename,
        mimeType: "image/png",
        alt: asset.alt,
        localAsset: assetKey,
      },
    },
    { type: "done" },
  ]);
}

function imageAccessResponse(verified) {
  const message = verified
    ? "Image generation is not available to this OpenAI API project. The API key did not report an available GPT Image model. OpenAI's API Free tier does not support GPT Image, so add API billing or use a project with image access. No image request was started."
    : "I could not verify image-generation access for this OpenAI API key, so no image request was started. Check the API project's model access and billing, then try again.";

  return ndjsonResponse([
    {
      type: "status",
      phase: "checking_access",
      message: "Checking image-generation access...",
    },
    { type: "delta", delta: message },
    { type: "done" },
  ]);
}

function completedImages(response) {
  if (!Array.isArray(response?.output)) return [];

  return response.output.filter(
    (output) =>
      output?.type === "image_generation_call"
      && typeof output.result === "string"
      && output.result.length > 0,
  );
}

function completedUsage(response) {
  const usage = response?.usage;
  const inputTokens = Number.isSafeInteger(usage?.input_tokens)
    ? usage.input_tokens
    : null;
  const outputTokens = Number.isSafeInteger(usage?.output_tokens)
    ? usage.output_tokens
    : null;
  const totalTokens = Number.isSafeInteger(usage?.total_tokens)
    ? usage.total_tokens
    : null;

  if (inputTokens === null || outputTokens === null || totalTokens === null) {
    return null;
  }

  return { inputTokens, outputTokens, totalTokens };
}

export async function POST(request) {
  let messages;
  let requestedModel;
  let portalContext;

  try {
    const body = await readJsonBody(request);
    messages = normalizeMessages(body?.messages);
    requestedModel = body?.model;
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

  try {
    portalContext = await getPortalAiContext(request.headers);
  } catch (error) {
    return portalErrorResponse(error);
  }

  const approvedBrandAsset = requestedApprovedBrandAsset(messages);
  if (approvedBrandAsset) {
    return approvedBrandAssetResponse(approvedBrandAsset);
  }

  if (!process.env.OPENAI_API_KEY) {
    return Response.json(
      { error: "OPENAI_API_KEY is not configured on the server." },
      { status: 503 },
    );
  }

  let catalog;

  try {
    catalog = await getModelCatalog();
  } catch (error) {
    logApiError("OpenAI model access check failed", error);
    catalog = getFallbackModelCatalog();
  }

  let selectedModel;

  try {
    selectedModel = resolveRequestedModel(requestedModel, catalog);
  } catch (error) {
    return Response.json({ error: error.message }, { status: 400 });
  }

  const imageRequested = isImageRequest(messages);
  if (imageRequested && !catalog.imageModel) {
    return imageAccessResponse(catalog.verified);
  }

  let clientUsage;
  try {
    clientUsage = await reservePortalAiRequest(portalContext);
  } catch (error) {
    return portalErrorResponse(error);
  }

  const clientInstructions = portalContext.instructions.slice(0, 12000);
  const requestInstructions = [
    ASSISTANT_INSTRUCTIONS,
    `Current client account: ${portalContext.clientName}.`,
    clientInstructions
      ? `Approved client-specific instructions:\n${clientInstructions}`
      : "No approved client-specific instructions are connected yet.",
    portalContext.vectorStoreId
      ? "A client-specific approved knowledge base is connected. Use file search when it is relevant and do not claim that unreturned information exists."
      : "No client-specific file knowledge base is connected yet.",
  ].join("\n\n");
  const tools = [];

  if (portalContext.vectorStoreId) {
    tools.push({
      type: "file_search",
      vector_store_ids: [portalContext.vectorStoreId],
      max_num_results: 6,
    });
  }

  if (catalog.imageModel && imageRequested) {
    tools.push({
      type: "image_generation",
      action: "generate",
      model: catalog.imageModel,
      output_format: "webp",
      output_compression: 82,
      partial_images: 0,
      quality: "medium",
      size: "1024x1024",
    });
  }

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const upstreamController = new AbortController();
  let requestTimedOut = false;
  const timeout = setTimeout(() => {
    requestTimedOut = true;
    upstreamController.abort(new Error("OpenAI request timed out."));
  }, REQUEST_TIMEOUT_MS);
  request.signal.addEventListener(
    "abort",
    () => upstreamController.abort(request.signal.reason),
    { once: true },
  );
  let response;
  let openAIRequestId = "";

  try {
    const result = await openai.responses.create(
      {
        model: selectedModel,
        instructions: requestInstructions,
        input: messages,
        max_output_tokens: MAX_OUTPUT_TOKENS,
        stream: true,
        store: false,
        ...(tools.length ? { tools } : {}),
      },
      { signal: upstreamController.signal },
    ).withResponse();
    response = result.data;
    openAIRequestId = result.request_id || "";
  } catch (error) {
    clearTimeout(timeout);
    const failure = openAIErrorDetails(error, {
      stage: imageRequested
        ? "Starting image-generation response"
        : "Starting text response",
      selectedModel,
      imageModel: imageRequested ? catalog.imageModel : "",
    });
    logApiError("OpenAI request failed", error, failure.diagnostic);
    return Response.json(
      {
        error: failure.message,
        diagnostic: failure.diagnostic,
        clientUsage,
      },
      { status: error?.status >= 400 && error.status < 500 ? error.status : 502 },
    );
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      let terminalEventSent = false;
      let textSent = false;
      let assetSent = false;
      let writingStatusSent = false;

      const send = (payload) => {
        controller.enqueue(encoder.encode(jsonLine(payload)));
      };

      send({
        type: "status",
        phase: imageRequested ? "preparing_image" : "thinking",
        message: imageRequested
          ? "Preparing image generation..."
          : "Thinking...",
        clientUsage,
      });

      try {
        for await (const event of response) {
          if (event.type === "response.output_text.delta") {
            if (!writingStatusSent) {
              send({
                type: "status",
                phase: "writing",
                message: "Writing a response...",
              });
              writingStatusSent = true;
            }

            textSent ||= Boolean(event.delta);
            send({ type: "delta", delta: event.delta });
          }

          if (event.type === "response.image_generation_call.in_progress") {
            send({
              type: "status",
              phase: "preparing_image",
              message: "Preparing the image model...",
            });
          }

          if (event.type === "response.image_generation_call.generating") {
            send({
              type: "status",
              phase: "generating_image",
              message: "Generating your image...",
            });
          }

          if (event.type === "response.image_generation_call.completed") {
            send({
              type: "status",
              phase: "finalizing_image",
              message: "Finalizing your image...",
            });
          }

          if (
            event.type === "response.file_search_call.in_progress"
            || event.type === "response.file_search_call.searching"
          ) {
            send({
              type: "status",
              phase: "processing_files",
              message: "Checking connected files...",
            });
          }

          if (
            event.type === "response.failed"
            || event.type === "response.incomplete"
            || event.type === "error"
          ) {
            const apiError = event.response?.error || event;
            const failure = openAIErrorDetails(apiError, {
              stage: imageRequested
                ? "Generating image"
                : "Streaming text response",
              selectedModel,
              imageModel: imageRequested ? catalog.imageModel : "",
              requestId: event.response?._request_id || openAIRequestId,
            });
            logApiError(
              "OpenAI response failed",
              apiError,
              failure.diagnostic,
            );
            send({
              type: "error",
              message: failure.message,
              diagnostic: failure.diagnostic,
              clientUsage,
            });
            terminalEventSent = true;
            break;
          }

          if (event.type === "response.completed") {
            const images = completedImages(event.response);
            const usage = completedUsage(event.response);
            const updatedClientUsage = usage
              ? {
                  ...clientUsage,
                  inputTokens: clientUsage.inputTokens + usage.inputTokens,
                  outputTokens: clientUsage.outputTokens + usage.outputTokens,
                  totalTokens: clientUsage.totalTokens + usage.totalTokens,
                }
              : clientUsage;

            if (usage) {
              await recordPortalAiTokens(
                portalContext.clientId,
                clientUsage.periodStart,
                usage,
              ).catch((error) => {
                logApiError("Portal token usage recording failed", error, {
                  category: "portal_usage_recording",
                  stage: "Saving token usage",
                });
              });
            }

            if (images.length > 0 && !textSent) {
              send({ type: "delta", delta: "I generated the image for you." });
              textSent = true;
            }

            images.forEach((image, index) => {
              send({
                type: "asset",
                asset: {
                  id: image.id || `generated-image-${Date.now()}-${index + 1}`,
                  kind: "image",
                  filename: `aoc-generated-image-${index + 1}.webp`,
                  mimeType: "image/webp",
                  alt: "AI-generated image",
                  dataUrl: `data:image/webp;base64,${image.result}`,
                },
              });
              assetSent = true;
            });

            if (!textSent && !assetSent) {
              send({
                type: "error",
                message: "The request completed but did not return any text or file.",
                clientUsage: updatedClientUsage,
              });
            } else {
              send({
                type: "done",
                model: selectedModel,
                ...(usage ? { usage } : {}),
                clientUsage: updatedClientUsage,
              });
            }

            terminalEventSent = true;
            break;
          }
        }

        if (!terminalEventSent && !request.signal.aborted) {
          send({
            type: "error",
            message: requestTimedOut
              ? "The response took too long and was stopped. Please try again."
              : "The AI response ended unexpectedly.",
            clientUsage,
          });
        }
      } catch (error) {
        if (!request.signal.aborted) {
          const failure = openAIErrorDetails(error, {
            stage: imageRequested
              ? "Streaming image generation"
              : "Streaming text response",
            selectedModel,
            imageModel: imageRequested ? catalog.imageModel : "",
            requestId: openAIRequestId,
          });
          logApiError("OpenAI stream failed", error, failure.diagnostic);
          send({
            type: "error",
            message: requestTimedOut
              ? "The response took too long and was stopped. Please try again."
              : failure.message,
            diagnostic: failure.diagnostic,
            clientUsage,
          });
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

  return new Response(stream, { headers: streamHeaders() });
}
