import { ASSISTANT_INSTRUCTIONS } from "@/config/assistant";
import { resolveAdminContext } from "@/lib/admin-data";
import { builderHeaders, builderResponseError } from "@/lib/builder-data";
import { builderError } from "@/lib/builder-config";
import { assertTrustedOrigin, readJsonRequest } from "@/lib/request-security";
import { chatKitBackendUrl, signChatKitRequest } from "@/lib/chatkit-security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const { admin } = await resolveAdminContext(request.headers);
    const input = await readJsonRequest(request, 130000);
    if (!/^[1-9][0-9]{0,18}$/.test(input.clientId || "") || !Number.isInteger(input.revision) || input.revision < 1
      || !Array.isArray(input.messages) || input.messages.length < 1 || input.messages.length > 12
      || input.messages.some((m) => !m || !["user", "assistant"].includes(m.role) || typeof m.content !== "string" || !m.content.trim() || m.content.length > 12000)
      || input.messages.at(-1).role !== "user" || input.messages.reduce((total, m) => total + m.content.length, 0) > 30000) throw builderError("Use a saved draft and a shorter test conversation.");
    const body = JSON.stringify({ client_id: input.clientId, user_id: admin.id, revision: input.revision,
      instructions: ASSISTANT_INSTRUCTIONS, portal_origin: new URL(process.env.BETTER_AUTH_URL).origin,
      messages: input.messages.map(({ role, content }) => ({ role, content })) });
    const url = new URL("/builder-preview", chatKitBackendUrl(process.env.CHATKIT_BACKEND_URL || "http://127.0.0.1:8000"));
    const upstream = await fetch(url, { method: "POST", cache: "no-store", redirect: "error",
      signal: AbortSignal.any([request.signal, AbortSignal.timeout(105000)]), body,
      headers: { "Content-Type": "application/json", ...signChatKitRequest(body, process.env.CHATKIT_BACKEND_SECRET),
        ...(process.env.CHATKIT_VERCEL_PROTECTION_BYPASS ? { "x-vercel-protection-bypass": process.env.CHATKIT_VERCEL_PROTECTION_BYPASS } : {}) } });
    const data = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const errors = { 409: "Save or reload your draft before testing.", 429: "You have used the staff preview allowance of 20 replies per hour." };
      throw builderError(errors[upstream.status] || "Preview could not finish. Check the Python service, model access and API billing.", errors[upstream.status] ? upstream.status : 503);
    }
    return Response.json(data, { headers: builderHeaders });
  } catch (error) { return builderResponseError(error); }
}
