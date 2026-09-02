import "server-only";

export class RequestSecurityError extends Error {
  constructor(code, message, status) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function assertTrustedOrigin(requestHeaders) {
  const configuredUrl = process.env.BETTER_AUTH_URL;
  const origin = requestHeaders?.get?.("origin") || "";

  try {
    if (
      !configuredUrl
      || !origin
      || new URL(origin).origin !== new URL(configuredUrl).origin
    ) {
      throw new Error("origin mismatch");
    }
  } catch {
    throw new RequestSecurityError(
      "untrusted_request",
      "The request did not come from the configured portal origin.",
      403,
    );
  }
}

export async function readJsonRequest(request, maximumBytes = 32_000) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    throw new RequestSecurityError(
      "invalid_content_type",
      "Content-Type must be application/json.",
      415,
    );
  }

  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
    throw new RequestSecurityError(
      "request_too_large",
      "The request body is too large.",
      413,
    );
  }

  if (!request.body) {
    throw new RequestSecurityError("invalid_json", "The request body is empty.", 400);
  }

  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let totalBytes = 0;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      totalBytes += value.byteLength;
      if (totalBytes > maximumBytes) {
        await reader.cancel();
        throw new RequestSecurityError(
          "request_too_large",
          "The request body is too large.",
          413,
        );
      }
      body += decoder.decode(value, { stream: true });
    }
    body += decoder.decode();
  } finally {
    reader.releaseLock();
  }

  try {
    const parsed = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("not an object");
    }
    return parsed;
  } catch (error) {
    if (error instanceof RequestSecurityError) throw error;
    throw new RequestSecurityError("invalid_json", "The request body is invalid.", 400);
  }
}

export function requestSecurityErrorResponse(error) {
  if (!(error instanceof RequestSecurityError)) return null;
  return Response.json(
    { error: error.message, code: error.code },
    { status: error.status },
  );
}
