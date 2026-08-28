import { toNextJsHandler } from "better-auth/next-js";

import { auth, isPortalAuthConfigured } from "@/lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = toNextJsHandler(auth);

function unavailable() {
  return Response.json(
    {
      error: "Portal login is not configured yet.",
      code: "auth_not_configured",
    },
    { status: 503 },
  );
}

function protectedHandler(method) {
  return function handleAuthRequest(request) {
    if (!isPortalAuthConfigured()) return unavailable();
    return handlers[method](request);
  };
}

export const GET = protectedHandler("GET");
export const POST = protectedHandler("POST");
export const PATCH = protectedHandler("PATCH");
export const PUT = protectedHandler("PUT");
export const DELETE = protectedHandler("DELETE");
