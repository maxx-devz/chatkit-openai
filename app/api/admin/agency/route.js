import { agencyAdministration, changeAgencyAdministration, platformResponse, platformError, consoleMutation } from "@/lib/agency-administration";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try { const params = new URL(request.url).searchParams; return platformResponse(await agencyAdministration(request.headers, { agency: params.get("agency"), q: params.get("q") || "" })); }
  catch (error) { return platformError(error); }
}
export async function POST(request) { return consoleMutation(request, (headers, body) => changeAgencyAdministration(headers, body, new URL(request.url).searchParams.get("agency"))); }
