import "server-only";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomUUID } from "node:crypto";
import { getSessionCookie } from "better-auth/cookies";
import { cleanHeaders, cleanUrl } from "./model.js";
import { debuggerCookieBinding, debuggerEnabled, verifyDebuggerToken } from "./security.js";
import { createTraceBuffer, responseWithInlineTrace } from "./inline.js";

const KEY = Symbol.for("aoc.debugger.server.v2");
const state = globalThis[KEY] ||= { scope: new AsyncLocalStorage(), fetch: null };
function publishDebuggerRecords(trace, inputs) { trace?.add(inputs); }
function traceFetch() {
  if (state.fetch === globalThis.fetch) return;
  const original = globalThis.fetch;
  const wrapped = async (input, init) => {
    const scope = state.scope.getStore();
    if (!scope) return original(input, init);
    const rawUrl = input instanceof Request ? input.url : String(input);
    if (/\/api\/debugger\//.test(rawUrl)) return original(input, init);
    const id = `server:${randomUUID()}`, start = Date.now();
    const base = { ...scope.identity, id, parentId: scope.parentId, relationship: "outbound request", source: "server", category: "api", method: init?.method || input?.method || "GET", url: cleanUrl(rawUrl), start };
    publishDebuggerRecords(scope.trace, [{ ...base, state: "pending" }]);
    try {
      let options = init;
      try {
        const backend = new URL(process.env.CHATKIT_BACKEND_URL || "http://127.0.0.1:8000");
        if (new URL(rawUrl).origin === backend.origin && new URL(rawUrl).pathname === "/chatkit" && process.env.CHATKIT_BACKEND_SECRET?.length >= 32) {
          const payload = Buffer.from(JSON.stringify({ s: scope.sessionScope, transport: "inline", parentId: id, ...scope.identity, e: Date.now() + 120_000 })).toString("base64url");
          const signature = createHmac("sha256", process.env.CHATKIT_BACKEND_SECRET).update(`debug:${payload}`).digest("hex");
          const headers = new Headers(input instanceof Request ? input.headers : undefined);
          new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
          headers.set("x-aoc-debug-context", `${payload}.${signature}`);
          options = { ...init, headers };
        }
      } catch { /* Invalid debug configuration never changes a real request. */ }
      const response = await original(input, options);
      const headersAt = Date.now();
      publishDebuggerRecords(scope.trace, [{ ...base, state: "receiving", status: response.status, headersAt, responseHeaders: cleanHeaders(response.headers) }]);
      const finish = (status = "complete", error) => publishDebuggerRecords(scope.trace, [{ id, state: status, end: Date.now(), duration: Date.now() - start, error }]);
      if (!response.body) { finish(); return response; }
      const reader = response.body.getReader();
      const body = new ReadableStream({
        async pull(controller) {
          try {
            const { done, value } = await reader.read();
            if (done) { finish(); controller.close(); } else controller.enqueue(value);
          } catch (error) { finish(error?.name === "AbortError" ? "cancelled" : "failed", error?.name); controller.error(error); }
        },
        cancel(reason) { finish("cancelled"); return reader.cancel(reason); },
      });
      const observed = new Response(body, { status: response.status, statusText: response.statusText, headers: response.headers });
      for (const property of ["url", "redirected", "type"]) Object.defineProperty(observed, property, { value: response[property] });
      return observed;
    } catch (error) {
      publishDebuggerRecords(scope.trace, [{ ...base, state: error?.name === "AbortError" ? "cancelled" : "failed", error: error?.name || "Fetch failed", end: Date.now(), duration: Date.now() - start }]);
      throw error;
    }
  };
  globalThis.fetch = wrapped; state.fetch = wrapped;
}
export async function withDebuggerTrace(request, run) {
  if (!debuggerEnabled() || !process.env.BETTER_AUTH_SECRET) return run();
  const binding = debuggerCookieBinding(getSessionCookie(request.headers), process.env.BETTER_AUTH_SECRET);
  const access = verifyDebuggerToken(request.headers.get("x-aoc-debug-token"), binding, process.env.BETTER_AUTH_SECRET);
  const parentId = request.headers.get("x-aoc-debug-request");
  if (!access || !/^[\w.:-]{1,180}$/.test(parentId || "")) return run();
  const identity = { tabId: request.headers.get("x-aoc-debug-tab"), navigationId: request.headers.get("x-aoc-debug-navigation") };
  if (!Object.values(identity).every((value) => /^[\w.:-]{1,180}$/.test(value || ""))) return run();
  traceFetch();
  const trace = createTraceBuffer();
  try {
    return await state.scope.run({ sessionScope: access.s, parentId, identity, trace }, async () => {
      const response = await debuggerSpan("Next.js handler · response preparation", run);
      return responseWithInlineTrace(response, trace);
    });
  } catch (error) { trace.close(); throw error; }
}
export async function debuggerSpan(label, run) {
  const scope = state.scope.getStore(); if (!scope) return run();
  const id = `span:${randomUUID()}`, start = Date.now();
  const base = { ...scope.identity, id, parentId: scope.parentId, relationship: "instrumented operation", source: "server", category: "operation", label, state: "pending", start };
  publishDebuggerRecords(scope.trace, [base]);
  try {
    const value = await state.scope.run({ ...scope, parentId: id }, run);
    publishDebuggerRecords(scope.trace, [{ id, state: "complete", end: Date.now(), duration: Date.now() - start }]);
    return value;
  } catch (error) {
    publishDebuggerRecords(scope.trace, [{ id, state: "failed", error: error?.name || "Operation failed", end: Date.now(), duration: Date.now() - start }]);
    throw error;
  }
}
export function reportDebuggerServerError(error, request, context) {
  if (!debuggerEnabled()) return;
  const scope = state.scope.getStore();
  if (!scope) return; // Never publish request errors to a shared account feed.
  publishDebuggerRecords(scope.trace, [{
    id: `server-error:${randomUUID()}`, parentId: scope.parentId, ...scope.identity,
    source: "next-request-error", category: "error", label: `${context.routeType} error · ${context.routePath}`,
    error: `${error?.name || "ServerError"}${error?.digest ? ` · digest ${error.digest}` : ""}`,
    state: "failed", start: Date.now(), relationship: "Next.js request error",
  }]);
}
