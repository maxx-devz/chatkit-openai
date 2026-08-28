import {
  adminErrorResponse,
  assertTrustedAdminMutation,
  createAdminClient,
  loadAdminDashboard,
  updateAdminClient,
} from "@/lib/admin-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json(await loadAdminDashboard(request.headers), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    const body = await request.json();
    const client = await createAdminClient(body, request.headers);
    return Response.json({ created: true, client }, { status: 201 });
  } catch (error) {
    return adminErrorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    const body = await request.json();
    const client = await updateAdminClient(body, request.headers);
    return Response.json({ saved: true, client });
  } catch (error) {
    return adminErrorResponse(error);
  }
}
