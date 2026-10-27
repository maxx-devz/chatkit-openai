import { createHash } from "node:crypto";
import { safeTaskText } from "./hubstaff-task-content.js";

export const SEARCH_FRESHNESS_MS = 15 * 60_000;

export function hubstaffSearchScope(clientId, mappingUrl, environment = process.env) {
  if (!/^[1-9][0-9]{0,18}$/.test(String(clientId))) return null;
  try {
    const url = new URL(String(mappingUrl).trim());
    const match = url.pathname.match(/^\/app\/organizations\/([1-9]\d*)\/projects\/([1-9]\d*)\/?$/);
    if (url.origin !== "https://tasks.hubstaff.com" || !match || url.search || url.hash) return null;
    const projectUrl = url.origin + url.pathname.replace(/\/$/, "");
    const credential = environment.HUBSTAFF_PAT_REFRESH_TOKEN?.trim() || environment.HUBSTAFF_ACCESS_TOKEN?.trim() || "";
    const digest = value => createHash("sha256").update(value).digest("hex");
    return { clientId: String(clientId), mappingUrl: String(mappingUrl).trim(), projectUrl,
      organizationId: match[1], projectId: match[2], binding: digest(JSON.stringify([String(clientId), projectUrl, digest(credential)])) };
  } catch { return null; }
}

export function searchIndexState(row, scope, now = Date.now()) {
  const fresh = Boolean(row && scope && row.binding === scope.binding && row.mapping_url === scope.mappingUrl
    && !row.failure_code && row.checked_at && now - new Date(row.checked_at).getTime() <= SEARCH_FRESHNESS_MS);
  return { enabled: true, available: fresh, phase: !row ? "not_started" : !fresh ? "needs_sync"
    : !row.metadata_complete ? "building" : Number(row.pending_tasks) ? "indexing_comments" : "ready",
    metadataComplete: Boolean(fresh && row.metadata_complete),
    metadataCompletedAt: fresh ? row.metadata_completed_at : null,
    checkedAt: fresh ? row.checked_at : null, taskCount: fresh ? Number(row.task_count || 0) : 0,
    commentCount: fresh ? Number(row.comment_count || 0) : 0, pendingTasks: fresh ? Number(row.pending_tasks || 0) : 0,
    unresolvedPeopleTasks: fresh ? Number(row.unresolved_people_tasks || 0) : 0,
    completionAuthorAvailable: false, activityMeaning: "Task updates and indexed discussion; not proof of tracked time or who completed a task." };
}

function iso(value) {
  const date = value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function indexTask(task, columns, members) {
  const column = columns.get(String(task.list_id));
  if (!column || !Number.isSafeInteger(Number(task.id)) || Number(task.id) <= 0) throw new Error("unverified_task_project");
  const description = safeTaskText(task.description, 50_000);
  const value = { task_id: Number(task.id), list_id: Number(task.list_id), title: safeTaskText(task.subject, 240),
    description, column_name: safeTaskText(column.name, 150), done: task.done === true,
    assignee_names: [...new Set((Array.isArray(task.assignee_ids) ? task.assignee_ids : []).map(id => members[String(id)]).filter(Boolean))].sort(),
    people_complete: (Array.isArray(task.assignee_ids) ? task.assignee_ids : []).every(id => members[String(id)]),
    created_at: iso(task.created_at), updated_at: iso(task.updated_at), completed_at: iso(task.done_at),
    content_truncated: safeTaskText(task.description, 50_001).length > 50_000 };
  value.activity_at = [value.created_at, value.updated_at, value.completed_at].filter(Boolean).sort().at(-1) || null;
  value.fingerprint = createHash("sha256").update(JSON.stringify(value)).digest("hex");
  return value;
}

export function indexComment(comment, taskId, members) {
  if (Number(comment.task_id) !== Number(taskId) || !Number.isSafeInteger(Number(comment.id)) || Number(comment.id) <= 0) throw new Error("unverified_comment_task");
  return { comment_id: Number(comment.id), author_name: members[String(comment.user_id)] || "",
    content: safeTaskText(comment.content, 8000), created_at: iso(comment.created_at), updated_at: iso(comment.updated_at),
    content_truncated: safeTaskText(comment.content, 8001).length > 8000 };
}
