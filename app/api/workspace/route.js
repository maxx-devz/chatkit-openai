import {
  loadPortalWorkspace,
  portalErrorResponse,
  savePortalWorkspace,
} from "@/lib/portal-data";
import { sanitizeWorkspace } from "@/lib/workspace-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WORKSPACE_BYTES = 1_500_000;

export async function GET(request) {
  try {
    return Response.json(await loadPortalWorkspace(request.headers), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return portalErrorResponse(error);
  }
}

export async function PUT(request) {
  const contentLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_WORKSPACE_BYTES) {
    return Response.json(
      { error: "The saved workspace is too large.", code: "workspace_too_large" },
      { status: 413 },
    );
  }

  let workspace;

  try {
    const body = await request.text();
    if (new TextEncoder().encode(body).byteLength > MAX_WORKSPACE_BYTES) {
      return Response.json(
        { error: "The saved workspace is too large.", code: "workspace_too_large" },
        { status: 413 },
      );
    }

    workspace = sanitizeWorkspace(JSON.parse(body)?.workspace);
  } catch (error) {
    return Response.json(
      { error: error.message || "The workspace is invalid.", code: "invalid_workspace" },
      { status: 400 },
    );
  }

  try {
    const saved = await savePortalWorkspace(workspace, request.headers);
    return Response.json({ saved: true, ...saved });
  } catch (error) {
    return portalErrorResponse(error);
  }
}
