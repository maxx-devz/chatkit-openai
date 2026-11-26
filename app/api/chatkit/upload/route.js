import { chatKitBackendUrl, signChatKitRequest } from "@/lib/chatkit-security";
import { getPortalAiContext, portalErrorResponse } from "@/lib/portal-data";
import { assertTrustedOrigin, requestSecurityErrorResponse } from "@/lib/request-security";
import { readUpload, UploadRequestError, uploadErrorMessage } from "@/lib/chatkit-uploads";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const headers = { "Cache-Control": "private, no-store" };

export async function POST(request) {
  let upstreamTimeout;
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
    upstreamTimeout = AbortSignal.timeout(45_000);
    const upstream = await fetch(url, {
      method: "POST", headers: { "Content-Type": "application/json", ...signChatKitRequest(body, process.env.CHATKIT_BACKEND_SECRET),
        ...(process.env.CHATKIT_VERCEL_PROTECTION_BYPASS ? { "x-vercel-protection-bypass": process.env.CHATKIT_VERCEL_PROTECTION_BYPASS } : {}) },
      body, redirect: "error", cache: "no-store",
      signal: AbortSignal.any([request.signal, upstreamTimeout]),
    });
    let data;
    try { data=await upstream.json(); }
    catch(error) { if(upstreamTimeout.aborted||request.signal.aborted||['TimeoutError','AbortError'].includes(error?.name))throw error;throw new UploadRequestError('upload_failed',502); }
    if (!upstream.ok) {
      const message = uploadErrorMessage(data.code);
      return Response.json({ code:message?data.code:"upload_failed",error: message || uploadErrorMessage("upload_failed") }, {
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
    if (error instanceof UploadRequestError) return Response.json({ code:error.code,error: error.message }, { status: error.status, headers });
    if(request.signal.aborted)return Response.json({code:'upload_cancelled',error:uploadErrorMessage('upload_cancelled')},{status:408,headers});
    if(upstreamTimeout?.aborted||error?.name==='TimeoutError') {
      console.warn('WARN: ChatKit upload backend timed out',{code:'upload_timeout',timeoutMs:45000});
      return Response.json({code:'upload_timeout',error:uploadErrorMessage('upload_timeout')},{status:504,headers});
    }
    if(['ECONNREFUSED','ECONNRESET','ENOTFOUND','ETIMEDOUT'].includes(error?.cause?.code)) {
      console.error('ChatKit upload backend connection failed',{code:'upload_backend_unavailable',cause:error.cause.code});
      return Response.json({code:'upload_backend_unavailable',error:uploadErrorMessage('upload_backend_unavailable')},{status:503,headers});
    }
    console.error("ChatKit upload proxy failed", { name: error?.name });
    return Response.json({ error: uploadErrorMessage("upload_failed") }, { status: 503, headers });
  }
}
