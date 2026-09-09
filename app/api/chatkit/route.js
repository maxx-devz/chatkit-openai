import { ASSISTANT_INSTRUCTIONS } from "@/config/assistant";
import { chatKitBackendUrl, signChatKitRequest } from "@/lib/chatkit-security";
import { getPortalAiContext, portalErrorResponse } from "@/lib/portal-data";
import {
  assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse,
} from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const noStore = { "Cache-Control": "private, no-store", "X-Accel-Buffering": "no" };

export async function POST(request) {
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
    let url;
    let signedHeaders;
    const body = JSON.stringify({
      client_id: context.clientId,
      user_id: context.userId,
      instructions: ASSISTANT_INSTRUCTIONS,
      portal_origin: new URL(process.env.BETTER_AUTH_URL).origin,
      payload,
    });
    try {
      url = chatKitBackendUrl(process.env.CHATKIT_BACKEND_URL || "http://127.0.0.1:8000");
      signedHeaders = signChatKitRequest(body, process.env.CHATKIT_BACKEND_SECRET);
    } catch {
      console.error("ChatKit backend configuration is missing or invalid. See docs/CHATKIT_SETUP.md.");
      return Response.json({ error: "The assistant is being set up. Please contact Always Open Commerce." }, { status: 503, headers: noStore });
    }
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
      // Do not forward hosting-provider HTML, headers, or internal diagnostics.
      const messages = {
        400: "This chat request is not supported. Please start a new conversation.",
        403: "The assistant is unavailable for this account. Please refresh the page.",
        404: "This conversation is no longer available.",
        409: "A reply is already running in this conversation. Please wait and try again.",
        429: "Your account has reached its monthly AI allowance. Contact Always Open Commerce.",
      };
      console.error("ChatKit backend request failed", { status: upstream.status });
      await upstream.body?.cancel();
      return Response.json({ error: messages[upstream.status] || "The assistant could not connect. Please try again shortly." }, {
        status: messages[upstream.status] ? upstream.status : 503, headers: noStore,
      });
    }
    if (!contentType.startsWith("text/event-stream") && !contentType.startsWith("application/json")) {
      await upstream.body?.cancel();
      return Response.json({ error: "The assistant could not connect. Please try again shortly." }, { status: 502, headers: noStore });
    }
    return new Response(upstream.body, {
      status: upstream.status,
      headers: { ...noStore, "Content-Type": contentType },
    });
  } catch (error) {
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
