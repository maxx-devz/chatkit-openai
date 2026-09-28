import { libraryErrorResponse, libraryHeaders, loadLibraryFile } from "@/lib/client-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const file = await loadLibraryFile(request.headers, id);
    const filename = file.filename.replace(/[^a-zA-Z0-9 ._-]/g, "_");
    return new Response(file.content, { headers: {
      ...libraryHeaders, "Content-Type": file.mime_type, "Content-Length": String(file.content.length),
      "Content-Disposition": `attachment; filename="${filename}"`, "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    } });
  } catch (error) { return libraryErrorResponse(error); }
}
