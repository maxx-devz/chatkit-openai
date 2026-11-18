import { privateDownloadHeaders } from "@/lib/private-download";
import { libraryErrorResponse, loadLibraryFile } from "@/lib/client-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const file = await loadLibraryFile(request.headers, id);
    return new Response(file.content, { headers: privateDownloadHeaders(file) });
  } catch (error) { return libraryErrorResponse(error); }
}
