import { auth } from "@/lib/auth";
import { passwordValidationMessage } from "@/lib/input-validation";
import { portalErrorResponse, resolvePortalContext } from "@/lib/portal-data";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const context = await resolvePortalContext(request.headers);
    const input = await readJsonRequest(request, 1_000);
    if (Object.keys(input).sort().join(",") !== "currentPassword,newPassword"
      || typeof input.currentPassword !== "string" || !input.currentPassword
      || input.currentPassword.length > 128) {
      return Response.json({ error: "Enter your current password.", code: "invalid_current_password" },
        { status: 400 });
    }
    const validation = passwordValidationMessage(input.newPassword, context.user.username);
    if (validation) return Response.json({ error: validation, code: "invalid_new_password" }, { status: 400 });
    const authResponse = await auth.api.changePassword({
      body: { currentPassword: input.currentPassword, newPassword: input.newPassword,
        revokeOtherSessions: true },
      headers: request.headers, asResponse: true,
    });
    if (!authResponse.ok) {
      const payload = await authResponse.json().catch(() => null);
      const incorrect = payload?.code === "INVALID_PASSWORD";
      return Response.json({ error: incorrect ? "Your current password is incorrect."
        : "Your password could not be changed. Try again.",
      code: incorrect ? "invalid_current_password" : "password_change_failed" },
      { status: incorrect ? 400 : authResponse.status === 429 ? 429 : 503 });
    }
    const response = Response.json({ changed: true }, { headers: { "Cache-Control": "private, no-store" } });
    for (const cookie of authResponse.headers.getSetCookie()) response.headers.append("Set-Cookie", cookie);
    return response;
  } catch (error) {
    const response = requestSecurityErrorResponse(error) || portalErrorResponse(error);
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  }
}
