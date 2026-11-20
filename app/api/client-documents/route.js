import {clientDocumentList,documentResponse,documentFailure} from "@/lib/document-delivery";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request) {
  try {
    const params = new URL(request.url).searchParams;
    const data = await clientDocumentList(request.headers, params.get("clientId"), Number(params.get("page") || 0), {
      search: params.get("search") || "",
      category: params.get("category") || "",
      step: params.get("step") || "",
    });
    return documentResponse(data);
  } catch (error) { return documentFailure(error); }
}
