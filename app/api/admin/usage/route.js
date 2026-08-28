import {
  adminErrorResponse,
  assertTrustedAdminMutation,
  resetAdminClientUsage,
} from "@/lib/admin-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    const body = await request.json();
    const client = await resetAdminClientUsage(body?.slug, request.headers);
    return Response.json({ reset: true, client });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
