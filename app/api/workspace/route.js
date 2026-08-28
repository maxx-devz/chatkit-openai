import {
  loadPortalWorkspace,
  savePortalWorkspace,
} from "@/lib/portal-data";
import { sanitizeWorkspace } from "@/lib/workspace-validation";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_WORKSPACE_BYTES = 1_500_000;

function databaseErrorResponse(error) {
  const details = error?.publicDetails || {
    code: "database_error",
    message: "The portal database could not complete this request.",
  };

  return Response.json(
    { error: details.message, code: details.code },
    { status: details.code === "database_not_configured" ? 503 : 500 },
  );
}

export async function GET() {
  try {
    return Response.json(await loadPortalWorkspace(), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return databaseErrorResponse(error);
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
    const saved = await savePortalWorkspace(workspace);
    return Response.json({ saved: true, ...saved });
  } catch (error) {
    return databaseErrorResponse(error);
  }
}
