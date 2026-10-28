import { createInterface } from "node:readline";
import { stripVTControlCharacters } from "node:util";

const METHODS = {
  GET: "30;106", POST: "30;105", PUT: "97;44", PATCH: "30;103", DELETE: "97;41",
  HEAD: "30;102", OPTIONS: "30;107", CONNECT: "97;45", TRACE: "97;40",
};
const SOURCES = { WEB: "97;100", CHAT: "30;107", DRIVE: "30;106", INDEX: "30;103", DEV: "97;40" };
const SYNC_CODES = new Set([
  "setup_required", "not_connected", "reconnect_required", "google_request_failed", "root_unavailable",
  "source_access_restricted", "source_revision_changed", "source_connection_changed", "source_sync_lease_lost",
  "source_index_limit", "source_outside_scope", "source_sync_failed", "prepared_sources_unreadable",
  "inventory_timeout", "inventory_limit", "incomplete_inventory", "empty_document", "document_too_large",
  "office_archive_limit", "office_unreadable", "docx_unreadable", "spreadsheet_limit", "spreadsheet_unreadable",
  "sync_failed", "access_denied",
]);
const METHOD_PATTERN = Object.keys(METHODS).join("|");
const NEXT_REQUEST = new RegExp(`^\\s*(${METHOD_PATTERN})\\s+(\\S+)\\s+([1-5]\\d{2})\\s+in\\s+([\\d,.]+)\\s*(ms|s)(?=\\s|$)`, "i");
const PYTHON_REQUEST = new RegExp(`^\\s*(?:INFO:\\s*)?\\S+\\s+-\\s+"(${METHOD_PATTERN})\\s+(\\S+)\\s+HTTP/[\\d.]+"\\s+([1-5]\\d{2})(?:\\s|$)`, "i");

function paint(text, code, color) {
  return color ? `\x1b[${code}m${text}\x1b[0m` : text;
}

function badge(text, palette, width, color) {
  // Set BOTH foreground and background, rather than relying on a terminal's
  // default background. Padding is part of the badge; reset after every badge
  // so colors never bleed into the route, next column or following log line.
  return paint(` ${text.padEnd(width)} `, `1;${palette}`, color);
}

export function supportsLogColor(env = process.env, stream = process.stdout) {
  if (Object.hasOwn(env, "NO_COLOR")) return false;
  if (env.FORCE_COLOR !== undefined) return env.FORCE_COLOR !== "0";
  return Boolean(stream.isTTY) && env.TERM !== "dumb";
}

function requestPath(value) {
  // URLs may carry authorization tokens or private query values. A request
  // label needs the route, not its query, fragment, credentials or origin.
  try {
    if (/^https?:\/\//i.test(value)) return new URL(value).pathname;
  } catch { return "[invalid URL]"; }
  return value.split(/[?#]/, 1)[0];
}

function duration(value, unit) {
  const milliseconds = Number(value.replaceAll(",", "")) * (unit.toLowerCase() === "s" ? 1000 : 1);
  if (!Number.isFinite(milliseconds) || milliseconds < 0) return "--";
  return milliseconds >= 1000 ? `${(milliseconds / 1000).toFixed(2)} s` : `${Math.round(milliseconds)} ms`;
}

export function formatDevLine(raw, { source = "DEV", color = false, now = new Date() } = {}) {
  const line = stripVTControlCharacters(String(raw)).replace(/[\x00-\x08\x0b-\x1f\x7f]/g, "");
  if (!line.trim()) return null;
  const clock = paint(now.toTimeString().slice(0, 8), 37, color);
  const label = Object.hasOwn(SOURCES, source) ? source : "DEV";
  const prefix = `${clock} ${badge(label, SOURCES[label], 5, color)}`;
  const next = line.match(NEXT_REQUEST);
  const python = next ? null : line.match(PYTHON_REQUEST);
  if (next || python) {
    const [, method, path, status] = next || python;
    const statusCode = Number(status);
    const statusPalette = statusCode >= 500 ? "97;41" : statusCode >= 400 ? "30;103" : statusCode >= 300 ? "30;106" : statusCode >= 200 ? "30;102" : "97;44";
    const statusWord = ({ 401: "AUTH", 403: "DENIED", 404: "MISSING", 408: "TIMEOUT", 429: "LIMIT" })[statusCode]
      || (statusCode >= 500 ? "ERROR" : statusCode >= 400 ? "WARN" : statusCode >= 300 ? "REDIR" : statusCode >= 200 ? "OK" : "INFO");
    const methodLabel = badge(method.toUpperCase(), METHODS[method.toUpperCase()], 7, color);
    const statusLabel = badge(`${status} ${statusWord}`, statusPalette, 11, color);
    const elapsed = next ? duration(next[4], next[5]) : "--";
    return `${prefix} ${methodLabel} ${statusLabel} ${paint(elapsed.padStart(8), 37, color)}  ${requestPath(path)}`;
  }
  // Keep unfamiliar framework output and every traceback line instead of
  // dropping information when a framework changes its logging format.
  const levelMatch = line.match(/^\s*(INFO|WARNING|WARN|ERROR|CRITICAL|DEBUG):\s*/i);
  const text = levelMatch ? line.slice(levelMatch[0].length) : line;
  const level = levelMatch?.[1].toUpperCase() || (
    /\b(?:error|failed|failure|unavailable|traceback)\b/i.test(text) ? "ERROR"
      : /\b(?:warning|warn|partial)\b/i.test(text) ? "WARN" : "INFO"
  );
  const levelPalette = ["ERROR", "CRITICAL"].includes(level) ? "97;41" : ["WARN", "WARNING"].includes(level) ? "30;103" : "30;107";
  return `${prefix} ${badge(level, levelPalette, 7, color)} ${text}`;
}

export function attachDevOutput(child, { source, output = process.stdout, errorOutput = process.stderr,
  color = supportsLogColor(), clock = () => new Date() } = {}) {
  const readers = [];
  for (const [input, destination] of [[child.stdout, output], [child.stderr, errorOutput]]) {
    if (!input) continue;
    const reader = createInterface({ input, crlfDelay: Infinity, terminal: false });
    reader.on("line", line => {
      const formatted = formatDevLine(line, { source, color, now: clock() });
      if (formatted !== null) destination.write(`${formatted}\n`);
    });
    readers.push(reader);
  }
  // readline buffers partial chunks and flushes the last unterminated line on
  // EOF. Keep one reader per pipe so simultaneous services cannot splice lines.
  return readers;
}

function validCount(value) {
  return Number.isSafeInteger(value) && value >= 0 ? value : 0;
}

function syncCode(value) {
  // Fixed application codes and standard SQLSTATEs are useful diagnostics;
  // arbitrary provider messages/objects are not safe summary labels.
  return typeof value === "string" && (SYNC_CODES.has(value) || /^[0-9]{2}[A-Z0-9]{3}$/.test(value)) ? value : "sync_failed";
}

export function syncFailureMessage(error, kind = "drive") {
  return `ERROR: ${kind === "index" ? "Hubstaff index" : "Source sync"} unavailable | ${syncCode(error?.code)}`;
}

export function summarizeSync(result, kind = "drive") {
  const rows = Array.isArray(result?.results) ? result.results : result && typeof result === "object" ? [result] : [];
  let ready = 0, skipped = 0, failed = 0, unknown = 0;
  for (const row of rows) {
    if (row?.skipped === true) skipped++;
    else if (row?.ready === false || row?.code) failed++;
    else if (row?.ready === true || (kind === "index" && typeof row?.metadataComplete === "boolean")) ready++;
    else unknown++;
  }
  const sum = field => rows.reduce((total, row) => total + validCount(row?.[field]), 0);
  const incomplete = rows.filter(row => row?.metadataComplete === false).length;
  const state = failed || unknown || incomplete ? "WARN" : "INFO";
  const progress = [`${ready} ready`, ...(skipped ? [`${skipped} skipped`] : []),
    ...(failed ? [`${failed} failed`] : []), ...(unknown ? [`${unknown} unknown`] : [])].join(" | ");
  const counts = kind === "index"
    ? `${sum("syncedTasks")} tasks synced | ${sum("syncedComments")} comments synced${incomplete ? ` | ${incomplete} histories incomplete` : ""}`
    : `${sum("indexedDocuments")} indexed | ${sum("fetchedDocuments")} fetched | ${sum("reusedDocuments")} reused`
      + (sum("removedDocuments") ? ` | ${sum("removedDocuments")} removed` : "")
      + (sum("unsupportedFiles") ? ` | ${sum("unsupportedFiles")} unsupported` : "");
  const interval = validCount(result?.intervalSeconds);
  const failures = [...new Set(rows.filter(row => row?.ready === false || (row?.code && !row?.skipped))
    .map(row => syncCode(row?.code)))];
  // Only counts and fixed labels: no owner/client IDs, folder titles, document
  // contents, revision hashes or credentials from the worker result object.
  return `${state}: ${kind === "index" ? "Hubstaff index" : "Source sync"} | ${progress}`
    + (ready ? ` | ${counts}` : " | no refresh completed")
    + (failures.length ? ` | codes: ${failures.slice(0, 3).join(", ")}${failures.length > 3 ? ", ..." : ""}` : "")
    + (interval ? ` | interval ${interval}s` : "");
}
