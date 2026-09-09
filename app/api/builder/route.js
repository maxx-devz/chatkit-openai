import { loadBuilder, updateBuilder, builderHeaders, builderResponseError } from "@/lib/builder-data";
import { assertTrustedOrigin, readJsonRequest } from "@/lib/request-security";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try { return Response.json(await loadBuilder(request.headers, new URL(request.url).searchParams.get("clientId")), { headers: builderHeaders }); }
  catch (error) { return builderResponseError(error); }
}
export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    return Response.json({ state: await updateBuilder(request.headers, await readJsonRequest(request, 140000)) }, { headers: builderHeaders });
  } catch (error) { return builderResponseError(error); }
}
