export async function onRequestError(error, request, context) {
  if(process.env.NEXT_RUNTIME === "nodejs" && /^\/admin(?:\/|\?|$)/.test(request.path || "")) {
    const {reportAdminRenderError}=await import("./lib/admin-render-audit");
    await reportAdminRenderError(error,request);
  }
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "development" && process.env.DEBUGGER === "true") {
    const { reportDebuggerServerError } = await import("./lib/debugger/server");
    reportDebuggerServerError(error, request, context);
  }
}
