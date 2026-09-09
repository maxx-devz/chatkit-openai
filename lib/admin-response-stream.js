function responseError(code) {
  return Object.assign(new Error("OpenAI response failed"), { code });
}

// Stream failures can arrive after HTTP 200. A closed connection alone does
// not prove successful completion, even if some text has already arrived.
export async function consumeAdminResponse(events, { onDelta, onUsage }) {
  let completed = false;
  let hasText = false;
  for await (const event of events) {
    if (event.response?.usage) onUsage(event.response.usage);
    if (event.type === "error") throw responseError(event.code || event.error?.code);
    if (event.type === "response.failed") throw responseError(event.response?.error?.code);
    if (event.type === "response.incomplete") {
      throw responseError(event.response?.incomplete_details?.reason === "max_output_tokens" ? "output_limit" : "response_incomplete");
    }
    if (event.type === "response.output_text.delta" && typeof event.delta === "string") {
      hasText ||= Boolean(event.delta.trim());
      onDelta(event.delta);
    }
    if (event.type === "response.completed") completed = true;
  }
  if (!completed || !hasText) throw responseError("response_incomplete");
}
