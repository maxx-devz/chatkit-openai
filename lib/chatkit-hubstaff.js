const RESPONSE_OPERATIONS = new Set([
  "threads.create",
  "threads.add_user_message",
  "threads.retry_after_item",
]);

const HUBSTAFF_TOPIC = /\b(?:hubstaff|attachments?|attached\s+files?|comments?|conversation|time\s*(?:used|left|remaining|tracked)|hours?|budget|task|tasks|to[ -]?do|up next|backlog|in progress|doing|review|approval|completed|completion|done|blocker|project progress|assign(?:ed|ee|ees|ment)?|followers?|task owners?|project members?|work(?:ed|ing)?\s+(?:on|this|today|yesterday))\b/i;
const TASK_DETAILS_TOPIC = /\b(?:task|tasks|to[ -]?do|up next|backlog|in progress|doing|review|approval|completed|completion|done|blocker|project progress|assign(?:ed|ee|ees|ment)?|followers?|task owners?|project members?|work(?:ed|ing)?\s+(?:on|this|today|yesterday))\b/i;
const METRICS_TOPIC = /\b(?:hours?|time\s*(?:used|left|remaining|tracked)|budget|spent|remaining|available\s+left|tracked)\b/i;
const ACTIVITY_ANALYTICS_TOPIC = /\b(?:hours?|time)\b[\s\S]*\b(?:logged|tracked|task|tasks|lowest|least|highest|most|top|bottom|history|historical|daily|weekly|monthly|yearly)\b|\b(?:lowest|least|highest|most|top|bottom)\b[\s\S]*\b(?:hours?|time)\b|\b(?:lowest|least|highest|most|top|bottom)\b[\s\S]*\b(?:task|tasks)\b[\s\S]*\b(?:history|historical|year|month|week|day|logged|tracked)\b/i;
const CREDENTIAL_AUDIT_TOPIC = /\b(?:credential(?:s)?|password(?:s)?|passcode(?:s)?|pwd|login(?:s)?|sign[ -]?in|user[ -]?name(?:s)?|api[ _-]?key(?:s)?|access[ _-]?token(?:s)?|refresh[ _-]?token(?:s)?|secret(?:s)?)\b/i;
const TASK_CONVERSATION_TOPIC = /\b(?:comment(?:s)?|conversation(?:s)?|discussion(?:s)?|reply|replies|said|message(?:s)?)\b/i;
const TASK_PEOPLE_TOPIC = /\b(?:who|person|people|members?|assign(?:ed|ee|ees|ment)?|followers?|complete(?:d|r)?\s+by|owners?|responsible)\b/i;
const TASK_ATTACHMENT_TOPIC = /\b(?:attachments?|attached|uploaded|files?|documents?|screenshots?)\b/i;
const CONTEXT_MARKER = "\n\nRecent conversation context:\n";
const CONTEXTUAL_FOLLOWUP = /\b(?:it|its|that|this|them|their|they|those|same|earlier|above|previous(?:ly)?)\b|^\s*(?:and|also|what about|how about)\b/i;
const HUBSTAFF_TASK_LINK = /https:\/\/tasks\.hubstaff\.com\/app\/organizations\/\d+\/projects\/\d+\/tasks\/\d+\/?/gi;
const MONTH_NAMES = new Map([
  ["january", 0], ["jan", 0],
  ["february", 1], ["feb", 1],
  ["march", 2], ["mar", 2],
  ["april", 3], ["apr", 3],
  ["may", 4],
  ["june", 5], ["jun", 5],
  ["july", 6], ["jul", 6],
  ["august", 7], ["aug", 7],
  ["september", 8], ["sep", 8], ["sept", 8],
  ["october", 9], ["oct", 9],
  ["november", 10], ["nov", 10],
  ["december", 11], ["dec", 11],
]);

function isoDate(year, month, day) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
}

function datePartsInTimeZone(now, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month) - 1,
    day: Number(values.day),
  };
}

function rangeResult(year, month, startDay, stopDay, label, kind) {
  return {
    start: isoDate(year, month, startDay),
    stop: isoDate(year, month, stopDay),
    label,
    kind,
  };
}

/**
 * Extract a bounded calendar range from a Hubstaff question. The dates are
 * computed in the configured reporting timezone, but returned as date-only
 * values because Hubstaff's task timestamps are normalized server-side.
 */
export function hubstaffTaskDateRange(query, now = new Date(), timeZone = "UTC") {
  const text = hubstaffCurrentQuery(query).toLowerCase().replace(/\s+/g, " ").trim();
  if (!text) return null;

  let current;
  try {
    current = datePartsInTimeZone(now, timeZone);
  } catch {
    current = datePartsInTimeZone(now, "UTC");
  }

  if (/\b(?:all|entire|full)\s+(?:available\s+)?history\b|\ball[ -]?time\b|\bever\b/.test(text)) {
    return {
      start: null,
      stop: isoDate(current.year, current.month, current.day),
      label: "all available history",
      kind: "history",
      allHistory: true,
    };
  }

  const exactDate = text.match(/\b(20\d{2})[-\/.](0?[1-9]|1[0-2])[-\/.](0?[1-9]|[12]\d|3[01])\b/);
  if (exactDate) {
    const year = Number(exactDate[1]);
    const month = Number(exactDate[2]) - 1;
    const day = Number(exactDate[3]);
    if (day <= daysInMonth(year, month)) {
      const value = isoDate(year, month, day);
      return { start: value, stop: value, label: value, kind: "day" };
    }
  }

  if (/\byesterday\b/.test(text)) {
    const date = new Date(Date.UTC(current.year, current.month, current.day - 1));
    const value = isoDate(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
    return { start: value, stop: value, label: "yesterday", kind: "day" };
  }
  if (/\btoday\b/.test(text)) {
    const value = isoDate(current.year, current.month, current.day);
    return { start: value, stop: value, label: "today", kind: "day" };
  }

  if (/\blast\s+month\b|\bprevious\s+month\b/.test(text)) {
    const date = new Date(Date.UTC(current.year, current.month - 1, 1));
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    return rangeResult(year, month, 1, daysInMonth(year, month), "last month", "month");
  }

  const isoMonth = text.match(/\b(20\d{2})[-\/](0?[1-9]|1[0-2])\b/);
  let requestedMonth = isoMonth ? Number(isoMonth[2]) - 1 : null;
  if (requestedMonth === null) {
    for (const [name, month] of MONTH_NAMES) {
      if (new RegExp(`\\b${name}\\b`, "i").test(text)) {
        requestedMonth = month;
        break;
      }
    }
  }

  const explicitYear = text.match(/\b(20\d{2})\b/);
  let requestedYear = explicitYear ? Number(explicitYear[1]) : null;
  if (requestedYear === null && /\blast\s+year\b|\bprevious\s+year\b/.test(text)) {
    requestedYear = current.year - 1;
  } else if (requestedYear === null && /\bthis\s+year\b|\bcurrent\s+year\b/.test(text)) {
    requestedYear = current.year;
  }

  if (/\bthis\s+month\b|\bcurrent\s+month\b/.test(text)) {
    requestedMonth = current.month;
    requestedYear ??= current.year;
  }

  if (requestedMonth !== null) {
    requestedYear ??= current.year;
    const monthName = new Intl.DateTimeFormat("en-US", { month: "long", timeZone: "UTC" })
      .format(new Date(Date.UTC(requestedYear, requestedMonth, 1)));
    return rangeResult(
      requestedYear,
      requestedMonth,
      1,
      daysInMonth(requestedYear, requestedMonth),
      `${monthName} ${requestedYear}`,
      "month",
    );
  }

  if (requestedYear !== null) {
    return {
      start: `${requestedYear}-01-01`,
      stop: `${requestedYear}-12-31`,
      label: String(requestedYear),
      kind: "year",
    };
  }

  return null;
}

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
export function hubstaffContextQuery(payload, conversationContext = "") {
  if (!RESPONSE_OPERATIONS.has(payload?.type)) return null;
  if (payload.type === "threads.retry_after_item") {
    const prior = String(conversationContext || "").trim().slice(-6_000);
    const lastUser = prior.split(/\r?\n/).filter(line => line.startsWith("User: ")).at(-1)?.slice(6) || "";
    return lastUser ? `${lastUser}${CONTEXT_MARKER}${prior}` : "";
  }
  const query = chatKitInputText(payload);
  const prior = String(conversationContext || "").trim().slice(-6_000);
  if (query && HUBSTAFF_TOPIC.test(query)) {
    return (CONTEXTUAL_FOLLOWUP.test(query) || TASK_CONVERSATION_TOPIC.test(query) || TASK_ATTACHMENT_TOPIC.test(query)) && prior
      ? `${query}\n\nRecent conversation context:\n${prior}`.slice(0, 12_000)
      : query;
  }
  return query && prior && CONTEXTUAL_FOLLOWUP.test(query) && HUBSTAFF_TOPIC.test(prior)
    ? `${query}\n\nRecent conversation context:\n${prior}`.slice(0, 12_000)
    : null;
}

// Prior turns resolve identity only. They must never choose a new operation.
export function hubstaffCurrentQuery(query) {
  return String(query || "").split(CONTEXT_MARKER)[0];
}

export function hubstaffConversationContextRequested(payload) {
  if (!RESPONSE_OPERATIONS.has(payload?.type)) return false;
  if (payload.type === "threads.retry_after_item") return true;
  const query = chatKitInputText(payload);
  return Boolean(query && (CONTEXTUAL_FOLLOWUP.test(query) || TASK_CONVERSATION_TOPIC.test(query) || TASK_ATTACHMENT_TOPIC.test(query)));
}

export function chatKitThreadId(payload) {
  const value = payload?.params?.thread_id;
  return typeof value === "string" && /^thr_[a-f0-9]{32}$/i.test(value) ? value : "";
}

export function hubstaffTaskDetailsRequested(query) {
  return query === "" || TASK_DETAILS_TOPIC.test(hubstaffCurrentQuery(query))
    || TASK_CONVERSATION_TOPIC.test(hubstaffCurrentQuery(query)) || TASK_ATTACHMENT_TOPIC.test(hubstaffCurrentQuery(query));
}

export function hubstaffMetricsRequested(query) {
  return METRICS_TOPIC.test(hubstaffCurrentQuery(query));
}

export function hubstaffActivityAnalyticsRequested(query) {
  return ACTIVITY_ANALYTICS_TOPIC.test(hubstaffCurrentQuery(query));
}

export function hubstaffRankingLimit(query) {
  const match = hubstaffCurrentQuery(query).match(/\b(?:top|bottom|lowest|least|highest|most)\s+(\d{1,2})\b/i);
  return Math.min(20, Math.max(1, Number(match?.[1]) || 5));
}

export function hubstaffCredentialAuditRequested(query) {
  const text = hubstaffCurrentQuery(query);
  if (!CREDENTIAL_AUDIT_TOPIC.test(text)) return false;
  const explicitScan = /\b(?:scan|audit)\b/i.test(text);
  if (text.match(HUBSTAFF_TASK_LINK) || /\b(?:this|that|the|one|single)\s+task\b/i.test(text)) return false;
  if ((TASK_CONVERSATION_TOPIC.test(text) || text.match(HUBSTAFF_TASK_LINK)) && !explicitScan) return false;
  return explicitScan || (/\b(?:list|find|show|search|which)\b/i.test(text) && /\btasks\b/i.test(text));
}

export function hubstaffTaskConversationRequested(query) {
  return TASK_CONVERSATION_TOPIC.test(hubstaffCurrentQuery(query));
}

export function hubstaffTaskAttachmentsRequested(query) {
  return TASK_ATTACHMENT_TOPIC.test(hubstaffCurrentQuery(query));
}

export function hubstaffTaskPeopleRequested(query) {
  return TASK_PEOPLE_TOPIC.test(hubstaffCurrentQuery(query)) && TASK_DETAILS_TOPIC.test(hubstaffCurrentQuery(query));
}

export function hubstaffTaskReferences(query) {
  const [current, prior = ""] = String(query || "").split(CONTEXT_MARKER);
  let matches = current.match(HUBSTAFF_TASK_LINK) || [];
  if (!matches.length && prior) {
    const lines = prior.split(/\r?\n/).reverse();
    const user = lines.find(line => line.startsWith("User: ") && line.match(HUBSTAFF_TASK_LINK));
    if (user) matches = user.match(HUBSTAFF_TASK_LINK) || [];
    else {
      const assistant = lines.find(line => line.startsWith("Assistant: ") && line.match(HUBSTAFF_TASK_LINK));
      const candidates = [...new Set(assistant?.match(HUBSTAFF_TASK_LINK) || [])];
      if (candidates.length === 1) matches = candidates;
    }
  }
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
