import { aocDelivery, platformResponse, platformError, consoleMutation } from "@/lib/platform-console";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request) {
  try { return platformResponse(await aocDelivery(request.headers)); }
  catch (error) { return platformError(error); }
}
export async function PATCH(request) { return consoleMutation(request, aocDelivery); }
