// Only an already-authorized capture runtime receives router events. This hook
// loads no debugger code and installs no observers when DEBUGGER is disabled.
export function onRouterTransitionStart(url, type) {
  window.__AOC_DEBUGGER__?.route(url, type);
}
