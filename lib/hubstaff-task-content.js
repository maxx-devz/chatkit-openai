import { redactSensitiveText } from "./sensitive-text.js";

export function safeTaskText(value, maximum = 4000) {
  return redactSensitiveText(String(value || "").replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&#(?:x([0-9a-f]+)|(\d+));/gi,
      (_, hex, decimal) => String.fromCodePoint(Math.min(0x10ffff, parseInt(hex || decimal, hex ? 16 : 10))))
    .replace(/&(?:colon|quot|apos);/gi, entity => ({ "&colon;": ":", "&quot;": '"', "&apos;": "'" })[entity.toLowerCase()])
    .replace(/https?:\/\/[^\s)]+/gi, "[external link omitted]"))
    .replace(/[ \t]+/g, " ").trim().slice(0, maximum);
}

export function safeTaskConversation(result) {
  const comments = [];
  let characters = 0;
  let redactedComments = 0;
  let truncated = Boolean(result.truncated);
  const ordered = [...result.items].sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || Number(a.id) - Number(b.id));
  for (const comment of ordered.slice(-40).reverse()) {
    const original = String(comment.content || "");
    const sanitized = safeTaskText(original, 4000);
    const redacted = /\[(?:credential|token|email|private key|authentication|authorization)/.test(sanitized);
    if (redacted) redactedComments++;
    if (safeTaskText(original, 4001).length > 4000) truncated = true;
    if (characters + sanitized.length > 30_000) { truncated = true; break; }
    characters += sanitized.length;
    if (sanitized) comments.unshift({ content: sanitized, createdAt: String(comment.created_at || ""), updatedAt: String(comment.updated_at || ""), redacted });
  }
  return { available: true, comments, sensitiveCommentsOmitted: 0, redactedComments,
    truncated: truncated || ordered.length > 40 };
}

// The documented Tasks API provides metadata only: no file bytes or download URL.
// Never manufacture a download endpoint or forward the PAT to a linked website.
export function safeTaskAttachments(result, taskId) {
  const items = result.items.filter(item => Number(item.task_id) === Number(taskId));
  return { available: true, contentAvailable: false,
    items: items.slice(0, 20).map(item => ({ id: String(item.id), name: safeTaskText(item.file_name, 180),
      createdAt: String(item.created_at || ""), contentAvailable: false })),
    truncated: Boolean(result.truncated) || items.length > 20,
    reason: "Hubstaff Tasks returns attachment names but does not expose file contents or a download URL through this API. Upload the file in this chat to read its contents." };
}
