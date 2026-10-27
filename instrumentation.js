export async function onRequestError(error, request, context) {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.NODE_ENV === "development" && process.env.DEBUGGER === "true") {
    const { reportDebuggerServerError } = await import("./lib/debugger/server");
    reportDebuggerServerError(error, request, context);
  }
}
