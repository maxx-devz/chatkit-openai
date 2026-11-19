import { supportList, supportChange, platformResponse, platformError, consoleMutation } from "@/lib/platform-console";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try { return platformResponse({ requests: await supportList(request.headers) }); }
  catch (error) { return platformError(error); }
}
export async function POST(request) { return consoleMutation(request, supportChange); }
