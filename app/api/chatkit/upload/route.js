import { chatKitBackendUrl, signChatKitRequest } from "@/lib/chatkit-security";
import { getPortalAiContext, portalErrorResponse } from "@/lib/portal-data";
import { assertTrustedOrigin, requestSecurityErrorResponse } from "@/lib/request-security";
import { readUpload, UploadRequestError, uploadErrorMessage } from "@/lib/chatkit-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const context = await getPortalAiContext(request.headers);
    if (request.headers.get("x-aoc-client") !== context.clientId) {
      return Response.json({ error: "Your active account changed. Reload this page." }, { status: 409, headers });
    }
    if (!context.aiEnabled) return Response.json({ error: "The AI assistant is paused for this account." }, { status: 403, headers });
    if ((process.env.CHATKIT_UPLOADS_ENABLED || "true").toLowerCase() !== "true") throw new UploadRequestError("uploads_not_configured", 503);
    const payload = await readUpload(request);
    const body = JSON.stringify({ client_id: context.clientId, user_id: context.userId,
      instructions: "", payload });
    const url = chatKitBackendUrl(process.env.CHATKIT_BACKEND_URL || "http://127.0.0.1:8000");
    url.pathname = "/chatkit/upload";
    const upstream = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...signChatKitRequest(body, process.env.CHATKIT_BACKEND_SECRET),
        ...(process.env.CHATKIT_VERCEL_PROTECTION_BYPASS ? { "x-vercel-protection-bypass": process.env.CHATKIT_VERCEL_PROTECTION_BYPASS } : {}) },
      body, redirect: "error", cache: "no-store",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(45_000)]),
    });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const message = uploadErrorMessage(data.code);
      return Response.json({ error: message || uploadErrorMessage("upload_failed") }, {
        status: message ? upstream.status : 503, headers,
      });
    }
    if (data.type !== "file" || !/^atc_[0-9a-f]{32}$/.test(data.id) || typeof data.name !== "string" || typeof data.mime_type !== "string") {
      throw new UploadRequestError("upload_failed", 502);
    }
    // Whitelist the metadata ChatKit needs; never return file bytes or internal IDs.
    return Response.json({ id: data.id, type: "file", name: data.name, mime_type: data.mime_type }, { headers });
  } catch (error) {
    const known = requestSecurityErrorResponse(error) || (error?.publicDetails ? portalErrorResponse(error) : null);
    if (known) { known.headers.set("Cache-Control", "private, no-store"); return known; }
    if (error instanceof UploadRequestError) return Response.json({ error: error.message }, { status: error.status, headers });
    console.error("ChatKit upload proxy failed", { name: error?.name });
    return Response.json({ error: uploadErrorMessage("upload_failed") }, { status: 503, headers });
  }
}
