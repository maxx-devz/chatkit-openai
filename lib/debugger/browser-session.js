// Clear this session's in-memory debugger after logout/account change in a tab.
export function watchDebuggerSession(config, onEnd, fetcher) {
  let disposed = false, checking = false, lastCheck = 0;
  const controller = new AbortController();
  async function check() {
    if (disposed || checking || Date.now() - lastCheck < 10_000) return;
    checking = true; lastCheck = Date.now();
    try {
      const response = await fetcher("/api/debugger/session", { credentials: "same-origin", cache: "no-store", redirect: "error", signal: controller.signal });
      if (response.status === 404 || response.status === 401 || (response.ok && (await response.json()).channel !== config.channel)) {
        if (!disposed) onEnd();
      }
    } catch { /* An outage is not proof of an account switch. */ }
    finally { checking = false; }
  }
  const focus = () => { if (!document.hidden) void check(); };
  document.addEventListener("visibilitychange", focus);
  window.addEventListener("focus", focus);
  window.addEventListener("pageshow", focus);
  const timer = setInterval(check, 60_000);
  return () => { disposed = true; controller.abort(); clearInterval(timer); document.removeEventListener("visibilitychange", focus); window.removeEventListener("focus", focus); window.removeEventListener("pageshow", focus); };
}
