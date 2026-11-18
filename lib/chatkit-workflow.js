// These SSE comments are ignored by ChatKit, while the client portal can read
// them from the same response stream without another request or polling.
const MARKER = ": aoc-workflow ";
const REPLY_TYPES = new Set([
  "threads.create",
  "threads.add_user_message",
  "threads.retry_after_item",
]);

export function isReplyRequest(payload) {
  return REPLY_TYPES.has(payload?.type);
}

export function workflowMarker(stage) {
  return `${MARKER}${stage}\n\n`;
}

export function streamWithWorkflow(run) {
  const encoder = new TextEncoder();
  const replyDecoder = new TextDecoder();
  let reader;
  let canceled = false;
  let replyLine = "";
  let replyStarted = false;
  const hasAssistantEvent = (chunk) => {
    replyLine += replyDecoder.decode(chunk, { stream: true });
    let end;
    let found = false;
    while ((end = replyLine.indexOf("\n")) !== -1) {
      const line = replyLine.slice(0, end).replace(/\r$/, "");
      replyLine = replyLine.slice(end + 1);
      if (!line.startsWith("data: ")) continue;
      try {
        const event = JSON.parse(line.slice(6));
        if ((event.type === "thread.item.updated" && event.update?.type?.startsWith("assistant_message"))
          || ((event.type === "thread.item.added" || event.type === "thread.item.done") && event.item?.type === "assistant_message")) {
          found = true;
        }
      } catch { /* Incomplete or non-JSON SSE events are not reply content. */ }
    }
    if (replyLine.length > 65_536) replyLine = replyLine.slice(-128);
    return found;
  };
  const stream = new ReadableStream({
    async start(controller) {
      const send = (stage) => {
        if (!canceled) controller.enqueue(encoder.encode(workflowMarker(stage)));
      };
      const sendError = (message) => {
        if (!canceled) controller.enqueue(encoder.encode(`data: ${JSON.stringify({
          type: "error", message, allow_retry: true,
        })}\n\n`));
      };
      send("access");
      try {
        const response = await run(send);
        if (!response.ok || !response.headers.get("content-type")?.startsWith("text/event-stream") || !response.body) {
          const details = await response.json().catch(() => ({}));
          sendError(details.error || "The assistant could not connect. Please try again.");
          return;
        }
        reader = response.body.getReader();
        while (!canceled) {
          const { done, value } = await reader.read();
          if (done) break;
          if (!replyStarted && hasAssistantEvent(value)) {
            send("stream");
            replyStarted = true;
          }
          if (!canceled) controller.enqueue(value);
        }
      } catch (error) {
        if (!canceled) console.error("ChatKit workflow stream failed", { name: error?.name });
        sendError("The assistant connection was interrupted. Please try again.");
      } finally {
        if (!canceled) controller.close();
      }
    },
    cancel() {
      canceled = true;
      void reader?.cancel();
    },
  });
  return new Response(stream, {
    headers: { "Cache-Control": "private, no-store", "X-Accel-Buffering": "no", "Content-Type": "text/event-stream; charset=utf-8" },
  });
}

export async function isReplyFetch(input, init) {
  try {
    const body = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
    return typeof body === "string" && isReplyRequest(JSON.parse(body));
  } catch {
    return false;
  }
}

export function observeWorkflowStream(response, onStage, onError = () => {}) {
  if (!response.body || !response.headers.get("content-type")?.startsWith("text/event-stream")) {
    return response;
  }
  const decoder = new TextDecoder();
  let pending = "";
  let completed = false;
  let discardLine = false;
  const stream = response.body.pipeThrough(new TransformStream({
    transform(chunk, controller) {
      // Observe preparation failures before ChatKit handles the same bytes.
      // ChatKit displays their safe server message; the portal must not add a
      // contradictory generic connection error above it.
      if (completed) { controller.enqueue(chunk); return; }
      pending += decoder.decode(chunk, { stream: true });
      let end;
      while ((end = pending.indexOf("\n")) !== -1) {
        const line = pending.slice(0, end).replace(/\r$/, "");
        pending = pending.slice(end + 1);
        if (discardLine) { discardLine = false; continue; }
        if (line.startsWith(MARKER)) {
          try { onStage(line.slice(MARKER.length)); } catch { /* UI must not interrupt chat. */ }
          if (line.slice(MARKER.length) === "stream") completed = true;
        } else if (line.startsWith('data: ') && line.length <= 8192) {
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'error' && typeof event.message === 'string' && event.message.trim() && event.message.length <= 2000) {
              completed = true; onError(event.message);
            }
          } catch { /* Invalid events or UI observers must not interrupt chat. */ }
        }
        if (completed) { pending = ""; break; }
      }
      // Retain bounded error metadata, never a growing assistant message.
      if (pending.length > 8192) { pending = ""; discardLine = true; }
      controller.enqueue(chunk);
    },
  }));
  return new Response(stream, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
