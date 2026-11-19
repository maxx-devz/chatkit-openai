import { platformDirectory, platformChange, platformResponse, platformError, consoleMutation } from "@/lib/platform-console";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try { return platformResponse(await platformDirectory(request.headers, Object.fromEntries(new URL(request.url).searchParams))); }
  catch (error) { return platformError(error); }
}
export async function POST(request) { return consoleMutation(request, platformChange); }
