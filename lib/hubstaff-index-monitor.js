// Browser orchestration of authenticated admin batches, never direct Hubstaff
// access. Project mapping, credentials, redaction and cursors stay server-side.
export function nextIndexClient(clients, { now = Date.now(), afterId = "", retryAt = new Map() } = {}) {
  const start = Math.max(0, clients.findIndex(client => client.id === afterId) + 1);
  const ordered = [...clients.slice(start), ...clients.slice(0, start)];
  return ordered.find(client => !client.syncing && (retryAt.get(client.id) || 0) <= now
    && (typeof client.eligibleForBatch === "boolean" ? client.eligibleForBatch
      : !client.nextBatchAt || new Date(client.nextBatchAt).getTime() <= now)) || null;
}

export function createHubstaffIndexMonitor({ fetchImpl = fetch, onClients, onBusy, onBatch, onError,
  onAutomatic, onChecked, now = Date.now, schedule = setTimeout, unschedule = clearTimeout } = {}) {
  let running = false, automatic = true, busy = false, timer, controller, reading;
  let clients = [], afterId = "", cooldown = 0, statusFailures = 0;
  const retryAt = new Map(), failures = new Map();
  const endpoint = "/api/admin/hubstaff-index";
  function pauseForAuth(error) {
    if ([401, 403].includes(error.status) && error.code !== "hubstaff_access_denied") {
      automatic = false;
      onAutomatic?.(false);
      running = false;
      unschedule(timer);
      onBusy?.("");
      controller.abort();
      return true;
    }
    return false;
  }
  async function request(options = {}) {
    const response = await fetchImpl(endpoint, { cache: "no-store", credentials: "same-origin",
      ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(typeof data.error === "string" ? data.error : "Index status or synchronization is unavailable.");
      error.status = response.status;
      error.code = data.code;
      error.retryAfter = Math.max(0, Math.min(300, Number(data.retryAfterSeconds || response.headers.get("retry-after")) || 0)) * 1000;
      throw error;
    }
    return data;
  }
  async function refresh() {
    if (!running) return;
    if (reading) return reading;
    reading = (async () => {
      const data = await request();
      if (!Array.isArray(data.clients)) throw new Error("Index status response was incomplete.");
      if (!running) return;
      clients = data.clients;
      statusFailures = 0;
      onClients?.(clients);
      onChecked?.(now());
    })();
    try { await reading; } finally { reading = null; }
  }
  async function batch(client) {
    busy = true;
    afterId = client.id;
    onBusy?.(client.id);
    try {
      const data = await request({ method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId: client.id }) });
      if (!running) return;
      if (!data.skipped && (data.clientId !== client.id || !Number.isSafeInteger(data.syncedTasks) || data.syncedTasks < 0
        || !Number.isSafeInteger(data.syncedComments) || data.syncedComments < 0)) {
        throw new Error("Batch progress response was incomplete. Saved server cursors will be checked again.");
      }
      failures.delete(client.id);
      retryAt.set(client.id, now() + Math.max(12_000, Math.min(300_000, (Number(data.retryAfterSeconds) || 12) * 1000)));
      if (!data.skipped) onBatch?.(client.id, { tasks: data.syncedTasks, comments: data.syncedComments,
        completedAt: data.completedAt || new Date(now()).toISOString() });
      // Serialize the final status read after any read begun before this commit.
      if (reading) await reading;
      await refresh();
    } catch (error) {
      if (controller.signal.aborted || !running) return;
      const count = (failures.get(client.id) || 0) + 1;
      failures.set(client.id, count);
      const delay = Math.max(error.status === 429 ? 60_000 : 0, error.retryAfter || 0,
        Math.min(300_000, 15_000 * 2 ** Math.min(count - 1, 5)));
      retryAt.set(client.id, error.code === "hubstaff_access_denied" ? Infinity : now() + delay);
      if (error.status === 429) cooldown = now() + Math.max(60_000, delay);
      pauseForAuth(error);
      onError?.(error.message + (error.code === "hubstaff_access_denied"
        ? " This project is paused until you resume automatic sync."
        : running ? ` Retrying in at least ${Math.ceil(delay / 1000)} seconds.` : " Sign in again and reload this page."), client.id);
    } finally {
      busy = false;
      if (!controller.signal.aborted) onBusy?.("");
    }
  }
  async function tick() {
    if (!running) return;
    try {
      await refresh();
      if (running && automatic && !busy && now() >= cooldown) {
        const client = nextIndexClient(clients, { now: now(), afterId, retryAt });
        // Keep polling committed SQL totals while one bounded batch runs.
        if (client) void batch(client);
      }
    } catch (error) {
      if (!controller.signal.aborted && running) {
        statusFailures++;
        pauseForAuth(error);
        onError?.(error.message);
      }
    } finally {
      if (running) timer = schedule(tick, statusFailures ? Math.min(60_000, 5000 * 2 ** Math.min(statusFailures, 4)) : 5000);
    }
  }
  return {
    start() { if (running) return; running = true; controller = new AbortController(); void tick(); },
    stop() { running = false; unschedule(timer); controller?.abort(); },
    setAutomatic(value) {
      if (!running) return false;
      automatic = Boolean(value);
      if (automatic) { retryAt.clear(); failures.clear(); }
      onAutomatic?.(automatic);
      return true;
    },
  };
}
