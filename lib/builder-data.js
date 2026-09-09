import "server-only";
import pg from "pg";
import { resolveAdminContext, adminErrorResponse } from "@/lib/admin-data";
import { requestSecurityErrorResponse } from "@/lib/request-security";
import { builderError, DEFAULT_BUILDER_CONFIG, publicBuilderConfig } from "@/lib/builder-config";
import { readBuilder, mutateBuilder, liveConfig } from "@/lib/builder-repository";

export const builderPool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 3, connectionTimeoutMillis: 8000, idleTimeoutMillis: 20000 });
export const builderHeaders = { "Cache-Control": "private, no-store" };
export function builderResponseError(error) {
  if (["42P01", "42703"].includes(error?.code)) error = builderError("Builder setup is incomplete. Run npm run builder:migrate against this deployment's database.", 503);
  const response = requestSecurityErrorResponse(error) || adminErrorResponse(error);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}
export async function loadBuilder(headers, clientId) {
  const { admin } = await resolveAdminContext(headers);
  const clients = (await builderPool.query("SELECT id::text,display_name AS name FROM portal_clients ORDER BY display_name")).rows;
  const id = clientId || clients[0]?.id;
  if (id && !/^[1-9][0-9]{0,18}$/.test(id)) throw builderError("Invalid client.");
  return { admin, clients, state: id ? await readBuilder(builderPool, id) : null };
}
export async function updateBuilder(headers, input) {
  const { admin } = await resolveAdminContext(headers);
  const db = await builderPool.connect();
  try {
    await db.query("BEGIN");
    const state = await mutateBuilder(db, input, admin.id);
    await db.query("COMMIT");
    return state;
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}
export async function clientAppearance(clientId) {
  try {
    const { rows } = await builderPool.query(`SELECT c.assistant_instructions,c.openai_vector_store_id,b.published
      FROM portal_clients c LEFT JOIN portal_assistant_configs b ON b.client_id=c.id WHERE c.id=$1`, [clientId]);
    return publicBuilderConfig(rows.length ? liveConfig(rows[0], rows[0]) : DEFAULT_BUILDER_CONFIG);
  } catch (error) {
    if (error?.code === "42P01") return publicBuilderConfig(DEFAULT_BUILDER_CONFIG);
    throw error;
  }
}
