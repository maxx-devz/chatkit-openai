import { resolveAdminContext } from "@/lib/admin-data";
import { getPortalAiContext } from "@/lib/portal-data";
import { builderPool, builderHeaders, builderResponseError } from "@/lib/builder-data";
import { builderError } from "@/lib/builder-config";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw builderError("File not found.", 404);
    const preview = new URL(request.url).searchParams.get("preview") === "1";
    let rows;
    if (preview) {
      const { admin } = await resolveAdminContext(request.headers);
      ({ rows } = await builderPool.query("SELECT filename,mime_type,content FROM portal_assistant_files WHERE id=$1 AND user_id=$2 AND preview=TRUE AND created_at > NOW()-INTERVAL '24 hours'", [id, admin.id]));
    } else {
      const context = await getPortalAiContext(request.headers);
      if (!context.aiEnabled) throw builderError("Assistant access is paused.", 403);
      ({ rows } = await builderPool.query("SELECT filename,mime_type,content FROM portal_assistant_files WHERE id=$1 AND client_id=$2 AND user_id=$3 AND preview=FALSE", [id, context.clientId, context.userId]));
    }
    if (!rows.length) throw builderError("File not found.", 404);
    const file = rows[0];
    return new Response(file.content, { headers: { ...builderHeaders, "Content-Type": file.mime_type,
      "Content-Length": String(file.content.length), "Content-Disposition": `attachment; filename="${file.filename.replace(/[^a-zA-Z0-9 ._-]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" } });
  } catch (error) { return builderResponseError(error); }
}
