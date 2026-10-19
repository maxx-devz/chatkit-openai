import "server-only";
import { randomUUID } from "node:crypto";
import { isOpenRouterKey } from "@/lib/ai-provider";
import { databasePool } from "@/lib/database";
import { getRuntimeProvider } from "@/lib/provider-settings";

import { hasClientPermission } from "@/lib/client-permissions";
import { requireClientPermission, portalErrorResponse } from "@/lib/portal-data";
import { assertTrustedOrigin, readJsonRequest, requestSecurityErrorResponse } from "@/lib/request-security";

const pool = databasePool;
export const libraryHeaders = { "Cache-Control": "private, no-store" };

function libraryError(message, status = 400, code = "library_error") {
  return Object.assign(new Error(message), { publicDetails: { message, status, code } });
}
function clean(value, maximum, label, required = false) {
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > maximum || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(result)) {
    throw libraryError(`${label} is invalid.`);
  }
  return result;
}
function dateValue(value, label) {
  const result = clean(value, 10, label);
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(Date.parse(`${result}T00:00:00Z`))) {
    throw libraryError(`${label} must use YYYY-MM-DD.`);
  }
  return result;
}
function httpsUrl(value) {
  try {
    const url = new URL(clean(value, 1000, "Link", true));
    if (url.protocol !== "https:" || url.username || url.password) throw new Error("unsafe");
    url.hash = "";
    return url.href;
  } catch { throw libraryError("Use a normal HTTPS link without a username or password."); }
}
function record(row, canRemove = false) {
  return {
    id: row.id, type: row.source_type, title: row.title, description: row.description,
    url: row.source_url || "", filename: row.filename || "", mimeType: row.mime_type || "",
    periodStart: row.period_start || "", periodEnd: row.period_end || "",
    indexStatus: row.index_status, createdAt: row.created_at,
    downloadUrl: row.source_type === "file" ? `/api/client-library/${row.id}` : "",
    canRemove,
  };
}

export function libraryErrorResponse(error) {
  const known = requestSecurityErrorResponse(error)
    || (error?.publicDetails ? portalErrorResponse(error) : null);
  if (known) { known.headers.set("Cache-Control", "private, no-store"); return known; }
  const setup = ["42P01", "42703"].includes(error?.code);
  return Response.json({ error: setup
    ? "The document library is not ready. Run npm run library:migrate."
    : "The document library request could not be completed." },
  { status: setup ? 503 : 500, headers: libraryHeaders });
}

export async function listLibrary(headers) {
  const context = await requireClientPermission(headers, "client.documents.read");
  const { rows } = await pool.query(`SELECT id,source_type,title,description,source_url,filename,mime_type,
    period_start::text,period_end::text,index_status,created_at,submitted_by
    FROM portal_client_library WHERE client_id=$1 ORDER BY created_at DESC LIMIT 100`, [context.client.id]);
  return { context, items: rows.map(row => record(row,
    hasClientPermission(context.client.role, "client.documents.manage")
      || (hasClientPermission(context.client.role, "client.documents.contribute")
        && String(row.submitted_by) === context.user.id))) };
}

export async function addLibraryLink(request) {
  assertTrustedOrigin(request.headers);
  const context = await requireClientPermission(request.headers, "client.documents.contribute");
  const input = await readJsonRequest(request, 12_000);
  const title = clean(input.title, 180, "Title", true);
  const description = clean(input.description, 4000, "Description");
  const url = httpsUrl(input.url);
  const periodStart = dateValue(input.periodStart, "Start date");
  const periodEnd = dateValue(input.periodEnd, "End date");
  if (periodStart && periodEnd && periodStart > periodEnd) throw libraryError("Start date cannot be after end date.");
  const id = `lib_${randomUUID().replaceAll("-", "")}`;
  const { rows } = await pool.query(`INSERT INTO portal_client_library
    (id,client_id,submitted_by,source_type,title,description,source_url,period_start,period_end,index_status)
    VALUES($1,$2,$3,'link',$4,$5,$6,$7,$8,'not_applicable')
    RETURNING id,source_type,title,description,source_url,filename,mime_type,period_start::text,period_end::text,index_status,created_at`,
  [id, context.client.id, context.user.id, title, description, url, periodStart, periodEnd]);
  return record(rows[0], true);
}

async function deleteOpenAiFile(row) {
  if (!row.openai_file_id) return;
  const { apiKey } = await getRuntimeProvider("openai");
  if (!apiKey || isOpenRouterKey(apiKey)) {
    throw libraryError("The original OpenAI key is required to remove the indexed copy.", 503);
  }
  if (row.openai_vector_store_id) {
    const response = await fetch(`https://api.openai.com/v1/vector_stores/${encodeURIComponent(row.openai_vector_store_id)}/files/${encodeURIComponent(row.openai_file_id)}`, {
      method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok && response.status !== 404) throw libraryError("The indexed copy could not be removed. Please try again.", 502);
  }
  await fetch(`https://api.openai.com/v1/files/${encodeURIComponent(row.openai_file_id)}`, {
    method: "DELETE", headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  }).catch(() => {});
}

export async function removeLibraryItem(request) {
  assertTrustedOrigin(request.headers);
  const context = await requireClientPermission(request.headers, "client.documents.contribute");
  const input = await readJsonRequest(request, 1000);
  if (!/^lib_[0-9a-f]{32}$/.test(input.id || "")) throw libraryError("Document not found.", 404);
  const { rows } = await pool.query(`SELECT library.id,library.submitted_by,library.openai_file_id,client.openai_vector_store_id
    FROM portal_client_library library JOIN portal_clients client ON client.id=library.client_id
    WHERE library.client_id=$1 AND library.id=$2`, [context.client.id, input.id]);
  if (!rows.length) throw libraryError("Document not found.", 404);
  if (!hasClientPermission(context.client.role, "client.documents.manage")
    && String(rows[0].submitted_by) !== context.user.id) {
    throw libraryError("Only your own documents can be removed.", 403);
  }
  await deleteOpenAiFile(rows[0]);
  await pool.query("DELETE FROM portal_client_library WHERE client_id=$1 AND id=$2", [context.client.id, input.id]);
}

export async function loadLibraryFile(headers, id) {
  if (!/^lib_[0-9a-f]{32}$/.test(id || "")) throw libraryError("File not found.", 404);
  const context = await requireClientPermission(headers, "client.documents.read");
  const { rows } = await pool.query(`SELECT filename,mime_type,content FROM portal_client_library
    WHERE client_id=$1 AND id=$2 AND source_type='file'`, [context.client.id, id]);
  if (!rows.length) throw libraryError("File not found.", 404);
  return rows[0];
}
