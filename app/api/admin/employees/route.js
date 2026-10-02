import {
  adminErrorResponse,
  assertTrustedAdminMutation,
  createAdminEmployee,
  loadAdminEmployees,
  updateAdminEmployee,
} from "@/lib/admin-data";
import { readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    return Response.json(await loadAdminEmployees(request.headers), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return requestSecurityErrorResponse(error) || adminErrorResponse(error);
  }
}

export async function POST(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    const body = await readJsonRequest(request, 16_000);
    const employee = await createAdminEmployee(body, request.headers);
    return Response.json({ created: true, employee }, { status: 201 });
  } catch (error) {
    return requestSecurityErrorResponse(error) || adminErrorResponse(error);
  }
}

export async function PATCH(request) {
  try {
    assertTrustedAdminMutation(request.headers);
    const body = await readJsonRequest(request, 16_000);
    const employee = await updateAdminEmployee(body, request.headers);
    return Response.json({ saved: true, employee });
  } catch (error) {
    return requestSecurityErrorResponse(error) || adminErrorResponse(error);
  }
}
