const RESPONSE_OPERATIONS = new Set([
  "threads.create",
  "threads.add_user_message",
  "threads.retry_after_item",
]);

const HUBSTAFF_TOPIC = /\b(?:hubstaff|time\s*(?:used|left|remaining|tracked)|hours?|budget|task|tasks|to[ -]?do|up next|backlog|in progress|doing|review|approval|completed|completion|done|blocker|project progress|work(?:ed|ing)?\s+(?:on|this|today|yesterday))\b/i;
const TASK_DETAILS_TOPIC = /\b(?:task|tasks|to[ -]?do|up next|backlog|in progress|doing|review|approval|completed|completion|done|blocker|project progress|work(?:ed|ing)?\s+(?:on|this|today|yesterday))\b/i;
const METRICS_TOPIC = /\b(?:hours?|time\s*(?:used|left|remaining|tracked)|budget|spent|remaining|available\s+left|tracked)\b/i;
const HUBSTAFF_TASK_LINK = /https:\/\/tasks\.hubstaff\.com\/app\/organizations\/\d+\/projects\/\d+\/tasks\/\d+\/?/gi;

export function chatKitInputText(payload) {
  const input = payload?.params?.input;
  const content = Array.isArray(input?.content) ? input.content : [];
  const text = content
    .filter((part) => part?.type === "input_text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("\n");
  const quoted = typeof input?.quoted_text === "string" ? input.quoted_text : "";
  return `${text}\n${quoted}`.trim().slice(0, 12_000);
}

/**
 * Return the user's query only when the operation needs fresh Hubstaff data.
 * null means ordinary chat can go directly to the assistant without waiting
 * for Hubstaff. An empty string is reserved for retries, where the original
 * user message is stored in ChatKit rather than repeated in the request.
 */
export function hubstaffContextQuery(payload) {
  if (!RESPONSE_OPERATIONS.has(payload?.type)) return null;
  if (payload.type === "threads.retry_after_item") return "";
  const query = chatKitInputText(payload);
  return query && HUBSTAFF_TOPIC.test(query) ? query : null;
}

export function hubstaffTaskDetailsRequested(query) {
  return query === "" || TASK_DETAILS_TOPIC.test(String(query || ""));
}

export function hubstaffMetricsRequested(query) {
  return METRICS_TOPIC.test(String(query || ""));
}

export function hubstaffTaskReferences(query) {
  const matches = String(query || "").match(HUBSTAFF_TASK_LINK) || [];
  const references = matches.flatMap((value) => {
    try {
      const url = new URL(value);
      const match = url.pathname.match(/^\/app\/organizations\/(\d+)\/projects\/(\d+)\/tasks\/(\d+)\/?$/);
      if (!match) return [];
      return [{
        organizationId: Number(match[1]),
        projectId: Number(match[2]),
        taskId: Number(match[3]),
        url: `https://tasks.hubstaff.com/app/organizations/${match[1]}/projects/${match[2]}/tasks/${match[3]}`,
      }];
    } catch {
      return [];
    }
  });
  return [...new Map(references.map((reference) => [reference.taskId, reference])).values()].slice(0, 3);
}
