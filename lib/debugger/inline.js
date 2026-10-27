import { mergeRecords, sanitizeRecord } from "./model.js";

export const DEBUG_HEADER = "x-aoc-debug-records";
const MARKER = ": aoc-debug ";
const encoder = new TextEncoder();

// Owned by exactly one HTTP request. No user rooms, global history or collector.
export function createTraceBuffer(maximum = 120) {
  const records = new Map(), dirty = new Map(), listeners = new Set();
  let closed = false;
  return {
    add(inputs) {
      if (closed) return;
      for (const input of inputs.slice(0, maximum)) {
        const safe = sanitizeRecord(input);
        if (!safe) continue;
        // Server/provider instrumentation must never carry response bodies.
        delete safe.payload; delete safe.responsePreview;
        safe.revision = (records.get(safe.id)?.revision || 0) + 1;
        mergeRecords(records, [safe], maximum);
        if (records.has(safe.id)) dirty.set(safe.id, records.get(safe.id));
        if (dirty.size > maximum) dirty.delete(dirty.keys().next().value);
      }
      for (const listener of listeners) listener();
    },
    get pending() { return dirty.size > 0; },
    take() { const batch = [...dirty.values()]; dirty.clear(); return batch; },
    snapshot() { return [...records.values()]; },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    close() { closed = true; for (const listener of listeners) listener(); listeners.clear(); records.clear(); dirty.clear(); },
  };
}

export function encodeDebugHeader(records) {
  const selected = [];
  let truncated = false;
  for (const record of records.slice().reverse()) {
    const safe = sanitizeRecord(record);
    if (!safe) continue;
    delete safe.payload; delete safe.responsePreview;
    if (encoder.encode(JSON.stringify([...selected, safe])).length > 2700) { truncated = true; continue; }
    selected.push(safe);
  }
  if (truncated && selected[0]) selected[0] = { ...selected[0], observation: "Request trace metadata truncated to the response-header budget." };
  const bytes = encoder.encode(JSON.stringify(selected));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export function readDebugHeader(value, receive) {
  if (!value || value.length > 4000) return;
  try {
    const bytes = Uint8Array.from(atob(value.replace(/-/g, "+").replace(/_/g, "/")), (char) => char.charCodeAt(0));
    const records = JSON.parse(new TextDecoder().decode(bytes));
    if (Array.isArray(records)) receive(records.slice(0, 120));
  } catch { /* Malformed diagnostics cannot interrupt the real response. */ }
}

// Observe comments only; never retain entire SSE data lines / conversations.
export function debugCommentObserver(receive) {
  const decoder = new TextDecoder();
  let line = "", discarded = false;
  return (chunk) => {
    const text = decoder.decode(chunk, { stream: true });
    for (const part of text.split(/(?<=\n)/)) {
      if (!discarded) {
        line += part;
        if (line.length > 100_000 || (line.length >= MARKER.length && !line.startsWith(MARKER))) { line = ""; discarded = true; }
      }
      if (part.endsWith("\n")) {
        if (!discarded && line.startsWith(MARKER)) {
          try { const records = JSON.parse(line.slice(MARKER.length)); if (Array.isArray(records)) receive(records.slice(0, 120)); } catch { /* Ignore malformed comments. */ }
        }
        line = ""; discarded = false;
      }
    }
  };
}

// Insert comments ONLY between SSE frames, including when network chunks split
// a data line, CRLF separator or UTF-8 character. No tee and one upstream read.
export function inlineTraceStream(body, trace) {
  const reader = body.getReader();
  let chunk, offset = 0, lineLength = 0, lastCR = false, boundary = true;
  let reading, cancelled = false, ended = false;
  const stream = new ReadableStream({
    async pull(controller) {
      while (!cancelled) {
        if (boundary && trace.pending) {
          controller.enqueue(encoder.encode(`${MARKER}${JSON.stringify(trace.take())}\n\n`));
          return;
        }
        if (ended) { trace.close(); controller.close(); return; }
        if (chunk && offset < chunk.length) {
          const start = offset;
          boundary = false;
          for (; offset < chunk.length;) {
            const byte = chunk[offset++];
            if (byte === 10) {
              const empty = lineLength === 0 || (lastCR && lineLength === 1);
              lineLength = 0; lastCR = false;
              if (empty) { boundary = true; break; }
            } else { lineLength++; lastCR = byte === 13; }
          }
          controller.enqueue(chunk.subarray(start, offset));
          return;
        }
        reading ||= reader.read().then((result) => ({ result }));
        let unsubscribe;
        const changed = new Promise((resolve) => { unsubscribe = trace.subscribe(() => resolve({ changed: true })); });
        let next;
        try { next = await (boundary ? Promise.race([reading, changed]) : reading); }
        catch (error) { trace.close(); controller.error(error); return; }
        finally { unsubscribe(); }
        if (cancelled) return;
        if (next.changed) continue;
        reading = null;
        if (next.result.done) ended = true;
        else { chunk = next.result.value; offset = 0; }
      }
    },
    cancel(reason) { cancelled = true; trace.close(); return reader.cancel(reason); },
  });
  return stream;
}

export function responseWithInlineTrace(response, trace) {
  if (!(response instanceof Response)) { trace.close(); return response; }
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.delete("content-length");
  if (response.body && headers.get("content-type")?.startsWith("text/event-stream")) {
    return new Response(inlineTraceStream(response.body, trace), { status: response.status, statusText: response.statusText, headers });
  }
  headers.set(DEBUG_HEADER, encodeDebugHeader(trace.snapshot()));
  trace.close();
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
