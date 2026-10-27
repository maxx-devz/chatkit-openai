import { ASSISTANT_INSTRUCTIONS } from "@/config/assistant";
import { chatKitBackendUrl, signChatKitRequest } from "@/lib/chatkit-security";
import {
  getPortalAiContext,
  loadPortalConversationContext,
  loadPortalConversationMode,
  portalErrorResponse,
} from "@/lib/portal-data";
import { uploadErrorMessage } from "@/lib/chatkit-uploads";
import { withDebuggerTrace, debuggerSpan } from "@/lib/debugger/server";
import { isReplyRequest, streamWithWorkflow } from "@/lib/chatkit-workflow";
import {
  chatKitThreadId,
  chatKitInputText,
  hubstaffContextQuery,
  hubstaffConversationContextRequested,
  hubstaffMetricsRequested, hubstaffActivityAnalyticsRequested,
  hubstaffCredentialAuditRequested, hubstaffTaskReferences,
} from "@/lib/chatkit-hubstaff";
import { loadHubstaffAssistantSnapshot } from "@/lib/hubstaff";
import { indexedHubstaffSnapshot } from "@/lib/hubstaff-search-store";
import { loadPreparedSourceContext } from "@/lib/prepared-source-context";
import { appendPreparedInstructions } from "@/lib/prepared-source-policy";
import { DriveSourceError } from "@/lib/drive-source-policy";
import {
  assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse,
} from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const noStore = { "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" };

export async function POST(request) {
  return withDebuggerTrace(request, () => handlePOST(request));
}
async function handlePOST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const context = await getPortalAiContext(request.headers);
    // An old browser tab must never send a prompt into a newly selected account.
    if (request.headers.get("x-aoc-client") !== context.clientId) {
      return Response.json({ error: "Your active account changed. Reload this page." }, { status: 409, headers: noStore });
    }
    if (!context.aiEnabled) {
      return Response.json({ error: "The AI assistant is paused for this account." }, { status: 403, headers: noStore });
    }
    const payload = await readJsonRequest(request, 100_000);
    const threadId = chatKitThreadId(payload);
    const mode = request.headers.get("x-aoc-chat-mode") || "work";
    if (mode !== "work" && mode !== "general") {
      return Response.json({ error: "Choose Work questions or General chat." }, { status: 400, headers: noStore });
    }
    if (threadId) {
      const savedMode = await loadPortalConversationMode(context.clientId, context.userId, threadId);
      if (!savedMode) return Response.json({ error: "This conversation is no longer available." }, { status: 404, headers: noStore });
      if (savedMode !== mode) return Response.json({ error: "This conversation belongs to the other chat mode. Reload and try again." }, { status: 409, headers: noStore });
    }
    const run = async (send = () => {}) => {
    const needsConversationContext = threadId && ((mode === "work" && hubstaffConversationContextRequested(payload))
      || (isReplyRequest(payload) && !chatKitInputText(payload)));
    if (needsConversationContext) send("context");
    const conversationContext = needsConversationContext
      ? await loadPortalConversationContext(context.clientId, context.userId, threadId)
        .catch((error) => {
          console.warn("Conversation context could not be loaded for Hubstaff routing", {
            code: error?.code || error?.publicDetails?.code || "database_error",
          });
          return "";
        })
      : "";
    const prepared = isReplyRequest(payload)
      ? await loadPreparedSourceContext({ clientId: context.clientId }, chatKitInputText(payload) || conversationContext, mode)
      : { instructions: "", references: [] };
    const hubstaffQuery = mode === "work" ? hubstaffContextQuery(payload, conversationContext) : null;
    // Database lookup only: no project-history scan on the reply hot path.
    const indexed = mode === "work" && isReplyRequest(payload)
      ? await debuggerSpan("Project search index", () => indexedHubstaffSnapshot(context.clientId, context.hubstaffProjectUrl)) : null;
    const needsLive = hubstaffQuery !== null && (!indexed || hubstaffMetricsRequested(hubstaffQuery)
      || hubstaffActivityAnalyticsRequested(hubstaffQuery) || hubstaffCredentialAuditRequested(hubstaffQuery)
      || hubstaffTaskReferences(hubstaffQuery).length > 0);
    if (needsLive) send("hubstaff");
    const live = needsLive
        ? await debuggerSpan("Relevant Hubstaff context", () => loadHubstaffAssistantSnapshot(context.hubstaffProjectUrl, {
          monthlyHoursLimit: context.hubstaffMonthlyHoursLimit,
          trackingProjectId: context.hubstaffTrackingProjectId,
          query: hubstaffQuery,
        }))
      : null;
    const hubstaff = live ? { ...live, ...(indexed ? {index: indexed.snapshot.index} : {}) } : indexed?.snapshot || null;
    let url;
    let signedHeaders;
    const body = JSON.stringify({
      client_id: context.clientId,
      user_id: context.userId,
      instructions: appendPreparedInstructions(ASSISTANT_INSTRUCTIONS, prepared.instructions),
      source_references: prepared.references,
      portal_origin: new URL(process.env.BETTER_AUTH_URL).origin,
      hubstaff,
      hubstaff_index_binding: indexed?.binding || "",
      chat_mode: mode,
      payload,
    });
    try {
      url = chatKitBackendUrl(process.env.CHATKIT_BACKEND_URL || "http://127.0.0.1:8000");
      signedHeaders = signChatKitRequest(body, process.env.CHATKIT_BACKEND_SECRET);
    } catch {
      console.error("ChatKit backend configuration is missing or invalid. See docs/CHATKIT_SETUP.md.");
      return Response.json({ error: "The assistant is being set up. Please contact Always Open Commerce." }, { status: 503, headers: noStore });
    }
    send("backend");
    const upstream = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...signedHeaders,
        ...(process.env.CHATKIT_VERCEL_PROTECTION_BYPASS
          ? { "x-vercel-protection-bypass": process.env.CHATKIT_VERCEL_PROTECTION_BYPASS }
          : {}),
      },
      body,
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(110_000)]),
    });
    const contentType = upstream.headers.get("content-type") || "";
    if (!upstream.ok) {
      const details = await upstream.json().catch(() => ({}));
      const uploadMessage = uploadErrorMessage(details.code);
      const providerMessage = ["provider_encryption_missing", "provider_credentials_unreadable"].includes(details.code)
        ? "The assistant needs an administrator configuration update. Please contact Always Open Commerce." : "";
      // Do not forward hosting-provider HTML, headers, or internal diagnostics.
      const messages = {
        400: "This chat request is not supported. Please start a new conversation.",
        403: "The assistant is unavailable for this account. Please refresh the page.",
        404: "This conversation is no longer available.",
        409: "A reply is already running in this conversation. Please wait and try again.",
        429: "Your account has reached its monthly AI allowance. Contact Always Open Commerce.",
      };
      console.error("ChatKit backend request failed", { status: upstream.status });
      return Response.json({ error: uploadMessage || providerMessage || messages[upstream.status] || "The assistant could not connect. Please try again shortly." }, {
        status: uploadMessage || messages[upstream.status] ? upstream.status : 503, headers: noStore,
      });
    }
    if (!contentType.startsWith("text/event-stream") && !contentType.startsWith("application/json")) {
      await upstream.body?.cancel();
      return Response.json({ error: "The assistant could not connect. Please try again shortly." }, { status: 502, headers: noStore });
    }
    if (contentType.startsWith("text/event-stream")) send("ready");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...noStore, "Content-Type": contentType },
    });
    };
    if (request.headers.get("x-aoc-workflow") === "1" && isReplyRequest(payload)) {
      return streamWithWorkflow(run);
    }
    return await run();
  } catch (error) {
    if (error instanceof DriveSourceError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
    const known = requestSecurityErrorResponse(error)
      || (error?.publicDetails ? portalErrorResponse(error) : null);
    if (known) {
      known.headers.set("Cache-Control", "private, no-store");
      return known;
    }
    console.error("ChatKit proxy failed", { name: error?.name });
    return Response.json({ error: "The assistant connection was interrupted. Please try again." }, { status: 503, headers: noStore });
  }
}
