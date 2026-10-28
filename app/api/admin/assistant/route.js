import OpenAI from "openai";
import { randomUUID } from 'node:crypto';
import { resolveAiProvider } from "@/lib/ai-provider";
import { getRuntimeProvider } from "@/lib/provider-settings";
import { runtimeGenerationOptions } from "@/lib/provider-generation-options";
import { recordAdminUsage } from "@/lib/portal-usage";
import { databasePool } from '@/lib/database';
import { startIntegrationRun, finishIntegrationRun } from '@/lib/integration-run-audit';
import { openaiIssue } from "@/lib/openai-issues";
import { consumeAdminResponse } from "@/lib/admin-response-stream";
import { environmentSecrets } from "@/lib/sensitive-text";
import { getSiteAiModel, saveSiteAiModel } from "@/lib/site-ai-settings";
import { validateSiteModel } from "@/lib/site-ai-repository";
import { loadPreparedSourceContext } from "@/lib/prepared-source-context";
import { appendPreparedInstructions, PREPARED_REFERENCE_NOTICE } from "@/lib/prepared-source-policy";
import { DriveSourceError } from "@/lib/drive-source-policy";

import { ADMIN_ASSISTANT_INSTRUCTIONS } from "@/config/assistant";
import {
  adminErrorResponse,
  loadAdminAssistantClient,
  resolveAdminContext,
} from "@/lib/admin-data";
import {
  getFallbackModelCatalog,
  getModelCatalog,
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
const MAX_UPSTREAM_MESSAGES = 13;
const MAX_OUTPUT_TOKENS = 900;

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

function recentMessages(messages) {
  return messages.slice(-MAX_UPSTREAM_MESSAGES);
}

function selectedClientContext(client, provider) {
  if (!client) {
    return "No client is selected. Answer only from the administrator conversation and general AOC instructions.";
  }

  const lastSeen = client.lastSeenAt
    ? new Date(client.lastSeenAt).toISOString()
    : "No recorded portal activity";

  return [
    `Selected client: ${client.name} (${client.slug}).`,
    "Verified portal snapshot from the AOC database:",
    `- Portal access: ${client.portalEnabled ? "enabled" : "disabled"}`,
    `- AI assistant: ${client.aiEnabled ? "enabled" : "disabled"}`,
    `- Current monthly AI usage: ${client.requestsUsed} of ${client.monthlyPromptLimit} requests (${client.requestsRemaining} remaining)`,
    `- Portal members: ${client.memberCount}`,
    `- Saved client conversations: ${client.conversationCount}`,
    `- Knowledge records: ${client.approvedKnowledge} approved, ${client.pendingKnowledge} pending`,
    `- Presence: ${client.isOnline ? "online now" : "offline"}; last seen: ${lastSeen}`,
    `- Hubstaff project: ${client.hubstaffProjectUrl ? "connected" : "not connected"}`,
    `- Approved website: ${client.approvedWebsiteUrl ? "connected" : "not connected"}`,
    `- OpenAI file knowledge base: ${client.vectorStoreId
      ? provider.supportsOpenAiHostedTools
        ? "connected and available"
        : `connected but unavailable through ${provider.label}`
      : "not connected"}`,
    "These are portal database facts, not live Hubstaff metrics. Do not invent Hubstaff hours, tasks, or budget values.",
    client.instructions
      ? `Approved client instructions:\n${client.instructions.slice(0, 12000)}`
      : "No approved client-specific instructions are connected.",
  ].join("\n");
}

function diagnostic(error, model, provider = resolveAiProvider()) {
  return {
    provider: provider.id,
    category: "ai_provider_error",
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

async function catalogForRequest(provider) {
  try {
    return await getModelCatalog(provider);
  } catch (error) {
    console.error("Admin assistant model list failed", {
      name: error?.name,
      status: error?.status,
      code: error?.code,
      requestId: error?.request_id,
    });
    return getFallbackModelCatalog(provider);
  }
}

export async function GET(request) {
  try {
    await resolveAdminContext(request.headers);
    const provider = await getRuntimeProvider();
    if (!provider.apiKey) {
      return Response.json(
        { error: "Configure a provider in AOC Admin AI provider settings." },
        { status: 503 },
      );
    }

    const [catalog, setting] = await Promise.all([catalogForRequest(provider), getSiteAiModel(provider)]);
    return Response.json(
      {
        defaultModel: setting.model,
        settingSource: setting.source,
        settingsReady: setting.ready,
        models: catalog.models.some((model) => model.id === setting.model) ? catalog.models
          : [{ id: setting.model, label: `${setting.model} (current; not in catalog)`, supportsTools: false }, ...catalog.models],
        provider: catalog.provider,
        providerLabel: catalog.providerLabel,
        verified: catalog.verified,
        notice: catalog.verified
          ? catalog.provider === "openrouter"
          ? "Models returned by OpenRouter's live catalog. Provider pricing applies."
            : "Models returned by this server's OpenAI API key."
          : `${catalog.providerLabel} model access could not be verified. The configured server default is shown.`,
      },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PUT(request) {
  try {
    assertTrustedOrigin(request.headers);
    const { admin } = await resolveAdminContext(request.headers);
    const body = await readJsonRequest(request, 2000);
    const provider = await getRuntimeProvider();
    if (body.provider !== provider.id) {
      return Response.json({ error: "The AI provider changed. Refresh this page before saving." }, { status: 409 });
    }
    const catalog = await getModelCatalog(provider);
    let model;
    try { model = validateSiteModel(body.model, catalog); }
    catch (error) { return Response.json({ error: error.message }, { status: 400 }); }
    const setting = await saveSiteAiModel(provider, model, admin.id);
    return Response.json({ ...setting, provider: provider.id },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error?.code === "42P01") {
      return Response.json({ error: "Run npm run site-ai:migrate to enable site-wide model settings." }, { status: 503 });
    }
    return requestSecurityErrorResponse(error) || adminErrorResponse(error);
  }
}

export async function POST(request) {
  let body;
  let messages;
  let provider;
  let admin;
  let selectedClient;

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

    const { admin } = await resolveAdminContext(request.headers);

    provider = await getRuntimeProvider();
    if (!provider.apiKey) {
      return Response.json(
        { error: "Configure a provider in AOC Admin AI provider settings.", code: "ai_provider_not_configured" },
        { status: 503 },
      );
    }

    // Browser overrides must not bypass the administrator's site-wide selection.
    const model = provider.model;

    selectedClient = await loadAdminAssistantClient(body?.clientSlug, request.headers);
    const clientContext = selectedClientContext(selectedClient, provider);
    const prepared = await loadPreparedSourceContext({ ownerId: admin.id }, messages.at(-1).content);
    const input = recentMessages(messages);
    if (prepared.references.length) input.splice(-1, 0, { role: "user",
      content: PREPARED_REFERENCE_NOTICE + JSON.stringify(prepared.references) });

    const tools = provider.supportsOpenAiHostedTools && selectedClient?.vectorStoreId
      ? [{
          type: "file_search",
          vector_store_ids: [selectedClient.vectorStoreId],
          max_num_results: 6,
        }]
      : [];

    // The SDK respects Retry-After and applies bounded backoff for eligible
    // temporary 429/503 responses. Keep the overall route deadline below Vercel's limit.
    const openai = new OpenAI({ apiKey: provider.apiKey, baseURL: provider.baseURL,
      defaultHeaders: provider.defaultHeaders, maxRetries: provider.id === "openrouter" ? 0 : 2 });
    let result;
    const startedAt = new Date().toISOString();
    const requestId = randomUUID();
    await databasePool.query('SELECT request_id FROM portal_ai_usage_events LIMIT 0');
    const runId = await startIntegrationRun(databasePool, { source: provider.id,
      operation: 'admin_assistant', actorUserId: admin.id,
      clientId: selectedClient?.id || null, portalArea: 'aoc_admin' });
    const upstreamController = new AbortController();
    const timeout = setTimeout(() => {
      upstreamController.abort(new Error("Admin assistant request timed out."));
    }, 50_000);
    request.signal.addEventListener(
      "abort",
      () => upstreamController.abort(request.signal.reason),
      { once: true },
    );
    try {
      result = await openai.responses.create(
        {
          model,
          ...runtimeGenerationOptions(provider),
          instructions: appendPreparedInstructions(`${ADMIN_ASSISTANT_INSTRUCTIONS}\n\n${clientContext}`, prepared.instructions),
          input,
          max_output_tokens: MAX_OUTPUT_TOKENS,
          stream: true,
          store: false,
          ...(tools.length ? { tools } : {}),
        },
        { signal: upstreamController.signal },
      ).withResponse();
    } catch (error) {
      clearTimeout(timeout);
      const audits = await Promise.allSettled([
        recordAdminUsage(startedAt, null, { code: openaiIssue(error, provider.id).code, model, provider,
          actorUserId: admin.id, clientId: selectedClient?.id || null, requestId }),
        finishIntegrationRun(databasePool, runId, { status: 'failed', errorCode: 'connection_unavailable' }),
      ]);
      for (const audit of audits) if (audit.status === 'rejected') {
        console.error('Admin AI failure audit failed', { code: audit.reason?.code || 'audit_error' });
      }
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
            knownSecrets: [...environmentSecrets(), provider.apiKey],
            onUsage: value => { usage = value; },
            onDelta: delta => sendLine(controller, { type: "delta", delta }),
          });
        } catch (error) {
          failure = openaiIssue(error, provider.id);
        } finally {
          clearTimeout(timeout);
          try {
            await recordAdminUsage(startedAt, usage, { code: failure?.code || "ready", model, provider,
              actorUserId: admin.id, clientId: selectedClient?.id || null, requestId });
          } catch (auditError) {
            console.error('Admin AI usage audit failed', { code: auditError?.code || 'audit_error' });
            failure ||= { code: 'audit_unavailable', message: 'The AI usage audit could not be saved.' };
          }
          await finishIntegrationRun(databasePool, runId, { status: failure ? 'failed' : 'succeeded',
            errorCode: failure ? 'connection_unavailable' : null }).catch(error => {
            console.error('Admin AI integration audit failed', { code: error?.code || 'audit_error' });
          });
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
    provider ||= resolveAiProvider();
    console.error("Admin assistant request failed", diagnostic(error, model, provider));
    if (error?.publicDetails) return adminErrorResponse(error);
    if (error instanceof DriveSourceError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "Cache-Control": "private, no-store" } });
    const issue = openaiIssue(error, provider.id);
    return Response.json(
      {
        error: issue.message,
        code: issue.code,
        diagnostic: diagnostic(error, model, provider),
      },
      { status: issue.httpStatus, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}
