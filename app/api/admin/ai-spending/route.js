import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { databasePool } from "@/lib/database";
import { readClientSpending } from "@/lib/ai-spending-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store" };

export async function GET(request) {
  try {
    await resolveAdminContext(request.headers);
    const period = new URL(request.url).searchParams.get("month") || undefined;
    return Response.json(await readClientSpending(databasePool, period), { headers });
  } catch (error) {
    if (error instanceof TypeError) return Response.json({ error: "Choose a valid month in YYYY-MM format." }, { status: 400, headers });
    if (error?.publicDetails) {
      const response = adminErrorResponse(error);
      response.headers.set("Cache-Control", "private, no-store");
      return response;
    }
    return Response.json({ error: "Client spending could not be loaded. No missing costs have been treated as zero." }, { status: 503, headers });
  }
}
