import {
  adminErrorResponse,
  assertTrustedAdminMutation,
  resolveAdminContext,
} from "@/lib/admin-data";
import {
  makeWebhookErrorResponse,
  sendMakeConnectionTest,
} from "@/lib/make-webhook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    await resolveAdminContext(request.headers);
    const result = await sendMakeConnectionTest();
    return Response.json(result, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    return makeWebhookErrorResponse(error) || adminErrorResponse(error);
  }
}
