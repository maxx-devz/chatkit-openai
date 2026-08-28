import "server-only";

import { neon } from "@neondatabase/serverless";

import { auth, isPortalAuthConfigured } from "@/lib/auth";

export const ACTIVE_CLIENT_COOKIE = "aoc_active_client";

let sqlClient;

function portalError(code, message, status) {
  return Object.assign(new Error(message), {
    publicDetails: { code, message, status },
  });
}

function publicDatabaseError(error) {
  const code = typeof error?.code === "string" ? error.code : "database_error";
  const missingSchema = code === "42P01" || code === "42703";
  const connectionFailure = [
    "08000",
    "08001",
    "08006",
    "57P01",
    "ECONNREFUSED",
    "ENOTFOUND",
  ].includes(code);

  return {
    code: missingSchema
      ? "database_schema_missing"
      : connectionFailure
        ? "database_unavailable"
        : "database_error",
    message: missingSchema
      ? "The Neon database is connected, but its authentication or portal tables are missing. Run the setup migrations in the README."
      : connectionFailure
        ? "The portal could not connect to Neon. Check DATABASE_URL and try again."
        : "The portal database could not complete this request.",
    status: connectionFailure ? 503 : 500,
  };
}

function databaseFailure(error, operation) {
  console.error(`Portal database ${operation} failed`, {
    code: error?.code,
    name: error?.name,
  });
  const details = publicDatabaseError(error);
  return Object.assign(new Error(details.message), { publicDetails: details });
}

function getSql() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw portalError(
      "database_not_configured",
      "Neon is not connected yet. Add DATABASE_URL to the server environment.",
      503,
    );
  }
  sqlClient ||= neon(process.env.DATABASE_URL);
  return sqlClient;
}

function cookieValue(requestHeaders, name) {
  const cookieHeader = requestHeaders?.get?.("cookie") || "";

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0) continue;
    if (part.slice(0, separator).trim() !== name) continue;

    try {
      return decodeURIComponent(part.slice(separator + 1).trim());
    } catch {
      return "";
    }
  }

  return "";
}

export function portalErrorResponse(error) {
  const details = error?.publicDetails || {
    code: "portal_error",
    message: "The portal could not complete this request.",
    status: 500,
  };

  return Response.json(
    { error: details.message, code: details.code },
    { status: details.status || 500 },
  );
}

export async function resolvePortalContext(requestHeaders) {
  if (!isPortalAuthConfigured()) {
    throw portalError(
      "auth_not_configured",
      "Portal login is not configured yet.",
      503,
    );
  }

  let session;

  try {
    session = await auth.api.getSession({ headers: requestHeaders });
  } catch (error) {
    throw databaseFailure(error, "session lookup");
  }

  if (!session?.user?.id) {
    throw portalError(
      "authentication_required",
      "Sign in to access this client portal.",
      401,
    );
  }

  const sql = getSql();
  let rows;

  try {
    rows = await sql`
      WITH synced_user AS (
        INSERT INTO portal_users (external_id, email, display_name)
        VALUES (
          ${session.user.id},
          ${session.user.email || null},
          ${session.user.name || session.user.username || null}
        )
        ON CONFLICT (external_id) DO UPDATE
          SET email = EXCLUDED.email,
              display_name = EXCLUDED.display_name,
              updated_at = NOW()
        RETURNING id
      )
      SELECT
        client.id,
        client.slug,
        client.display_name,
        client.assistant_instructions,
        client.openai_vector_store_id,
        membership.role,
        synced_user.id AS portal_user_id
      FROM synced_user
      JOIN portal_memberships AS membership
        ON membership.user_id = synced_user.id
      JOIN portal_clients AS client
        ON client.id = membership.client_id
      ORDER BY client.display_name ASC
    `;
  } catch (error) {
    throw databaseFailure(error, "membership lookup");
  }

  if (!rows.length) {
    throw portalError(
      "client_membership_required",
      "This login is valid, but no client account has been assigned to it yet.",
      403,
    );
  }

  const requestedSlug = cookieValue(requestHeaders, ACTIVE_CLIENT_COOKIE);
  const selected = rows.find((row) => row.slug === requestedSlug) || rows[0];

  return {
    session,
    user: {
      id: String(selected.portal_user_id),
      externalId: session.user.id,
      username: session.user.username || "",
      name: session.user.name || session.user.username || "Client user",
      email: session.user.email || "",
    },
    client: {
      id: String(selected.id),
      slug: selected.slug,
      name: selected.display_name,
      role: selected.role,
      instructions: selected.assistant_instructions?.trim() || "",
      vectorStoreId: selected.openai_vector_store_id?.trim() || "",
    },
    memberships: rows.map((row) => ({
      id: String(row.id),
      slug: row.slug,
      name: row.display_name,
      role: row.role,
    })),
  };
}

export async function loadPortalWorkspace(requestHeaders) {
  const context = await resolvePortalContext(requestHeaders);
  const sql = getSql();

  try {
    const rows = await sql`
      SELECT
        workspace.workspace,
        COALESCE(workspace.revision, 0) AS revision,
        COALESCE(knowledge.approved, 0) AS approved,
        COALESCE(knowledge.pending, 0) AS pending
      FROM (SELECT 1) AS anchor
      LEFT JOIN portal_workspace_snapshots AS workspace
        ON workspace.client_id = ${context.client.id}
       AND workspace.user_id = ${context.user.id}
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
        FROM portal_knowledge_items
        WHERE client_id = ${context.client.id}
      ) AS knowledge ON TRUE
      LIMIT 1
    `;
    const row = rows[0] || {};

    return {
      mode: "database",
      client: {
        slug: context.client.slug,
        name: context.client.name,
      },
      workspace: row.workspace || null,
      revision: Number(row.revision) || 0,
      knowledge: {
        approved: Number(row.approved) || 0,
        pending: Number(row.pending) || 0,
      },
    };
  } catch (error) {
    throw databaseFailure(error, "workspace load");
  }
}

export async function savePortalWorkspace(workspace, requestHeaders) {
  const context = await resolvePortalContext(requestHeaders);
  const sql = getSql();

  try {
    const serializedWorkspace = JSON.stringify(workspace);
    const rows = await sql`
      INSERT INTO portal_workspace_snapshots (
        client_id,
        user_id,
        workspace,
        revision,
        updated_at
      )
      VALUES (
        ${context.client.id},
        ${context.user.id},
        ${serializedWorkspace}::jsonb,
        1,
        NOW()
      )
      ON CONFLICT (client_id, user_id) DO UPDATE
        SET workspace = EXCLUDED.workspace,
            revision = portal_workspace_snapshots.revision + 1,
            updated_at = NOW()
      RETURNING revision, updated_at
    `;

    return {
      revision: Number(rows[0]?.revision) || 1,
      updatedAt: rows[0]?.updated_at || new Date().toISOString(),
    };
  } catch (error) {
    throw databaseFailure(error, "workspace save");
  }
}

export async function getPortalAiContext(requestHeaders) {
  const context = await resolvePortalContext(requestHeaders);

  return {
    clientName: context.client.name,
    instructions: context.client.instructions,
    vectorStoreId: context.client.vectorStoreId,
  };
}
