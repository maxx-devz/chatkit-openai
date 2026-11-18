import { AsyncLocalStorage } from "node:async_hooks";

// Scope nested provider reads, including concurrent requests for the same URL.
const workspace = new AsyncLocalStorage();
export function inWorkspaceCache(scope, operation) {
  return workspace.run(scope, operation);
}
export function workspaceCacheKey(key) {
  return JSON.stringify([workspace.getStore() ?? "control-plane", key]);
}
