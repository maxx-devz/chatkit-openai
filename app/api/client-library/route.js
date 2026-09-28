import { addLibraryLink, libraryErrorResponse, libraryHeaders, listLibrary, removeLibraryItem } from "@/lib/client-library";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const data = await listLibrary(request.headers);
    return Response.json({ items: data.items }, { headers: libraryHeaders });
  } catch (error) { return libraryErrorResponse(error); }
}
export async function POST(request) {
  try {
    return Response.json({ item: await addLibraryLink(request) }, { status: 201, headers: libraryHeaders });
  } catch (error) { return libraryErrorResponse(error); }
}
export async function DELETE(request) {
  try {
    await removeLibraryItem(request);
    return new Response(null, { status: 204, headers: libraryHeaders });
  } catch (error) { return libraryErrorResponse(error); }
}
