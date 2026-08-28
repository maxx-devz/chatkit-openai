import "server-only";

import { neon } from "@neondatabase/serverless";

const DEFAULT_CLIENT_SLUG = "churchbanners";
const DEFAULT_CLIENT_NAME = "ChurchBanners";
const DEFAULT_USER_ID = "prototype-user";

let sqlClient;

function cleanIdentity(value, fallback, maxLength = 100) {
  const cleaned = typeof value === "string"
    ? value.trim().toLowerCase().replace(/[^a-z0-9._-]+/g, "-").slice(0, maxLength)
    : "";

  return cleaned || fallback;
}

function cleanDisplayName(value, fallback) {
  const cleaned = typeof value === "string" ? value.trim().slice(0, 120) : "";
  return cleaned || fallback;
}

export function getPortalIdentity() {
  return {
    clientSlug: cleanIdentity(
      process.env.PORTAL_CLIENT_SLUG,
      DEFAULT_CLIENT_SLUG,
    ),
    clientName: cleanDisplayName(
      process.env.PORTAL_CLIENT_NAME,
      DEFAULT_CLIENT_NAME,
    ),
    userExternalId: cleanIdentity(
      process.env.PORTAL_USER_ID,
      DEFAULT_USER_ID,
      160,
    ),
  };
}

export function isPortalDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL?.trim());
}

function getSql() {
  if (!isPortalDatabaseConfigured()) return null;
  sqlClient ||= neon(process.env.DATABASE_URL);
  return sqlClient;
}

function publicDatabaseError(error) {
  const code = typeof error?.code === "string" ? error.code : "database_error";
  const missingSchema = code === "42P01";
  const connectionFailure = ["08000", "08001", "08006", "57P01"].includes(code);

  return {
    code: missingSchema
      ? "database_schema_missing"
      : connectionFailure
        ? "database_unavailable"
        : "database_error",
    message: missingSchema
      ? "The Neon database is connected, but the AOC portal schema has not been installed yet. Run database/schema.sql in the Neon SQL Editor."
      : connectionFailure
        ? "The portal could not connect to Neon. Check DATABASE_URL and try again."
        : "The portal database could not complete this request.",
  };
}

export async function loadPortalWorkspace() {
  const identity = getPortalIdentity();
  const sql = getSql();

  if (!sql) {
    return {
      mode: "browser",
      client: {
        slug: identity.clientSlug,
        name: identity.clientName,
      },
      workspace: null,
      revision: 0,
      knowledge: { approved: 0, pending: 0 },
    };
  }

  try {
    const rows = await sql`
      WITH client_row AS (
        INSERT INTO portal_clients (slug, display_name)
        VALUES (${identity.clientSlug}, ${identity.clientName})
        ON CONFLICT (slug) DO UPDATE
          SET display_name = EXCLUDED.display_name,
              updated_at = NOW()
        RETURNING id, slug, display_name
      ),
      user_row AS (
        INSERT INTO portal_users (external_id)
        VALUES (${identity.userExternalId})
        ON CONFLICT (external_id) DO UPDATE
          SET updated_at = NOW()
        RETURNING id, external_id
      ),
      membership_row AS (
        INSERT INTO portal_memberships (client_id, user_id, role)
        SELECT client_row.id, user_row.id, 'member'
        FROM client_row, user_row
        ON CONFLICT (client_id, user_id) DO UPDATE
          SET updated_at = NOW()
        RETURNING client_id, user_id
      )
      SELECT
        client_row.slug,
        client_row.display_name,
        workspace.workspace,
        COALESCE(workspace.revision, 0) AS revision,
        COALESCE(knowledge.approved, 0) AS approved,
        COALESCE(knowledge.pending, 0) AS pending
      FROM client_row
      CROSS JOIN user_row
      CROSS JOIN membership_row
      LEFT JOIN portal_workspace_snapshots AS workspace
        ON workspace.client_id = client_row.id
       AND workspace.user_id = user_row.id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE status = 'approved')::int AS approved,
          COUNT(*) FILTER (WHERE status = 'pending')::int AS pending
        FROM portal_knowledge_items
        WHERE client_id = client_row.id
      ) AS knowledge ON TRUE
    `;
    const row = rows[0];

    return {
      mode: "database",
      client: {
        slug: row.slug,
        name: row.display_name,
      },
      workspace: row.workspace || null,
      revision: Number(row.revision) || 0,
      knowledge: {
        approved: Number(row.approved) || 0,
        pending: Number(row.pending) || 0,
      },
    };
  } catch (error) {
    console.error("Portal workspace load failed", {
      code: error?.code,
      name: error?.name,
    });
    throw Object.assign(new Error(publicDatabaseError(error).message), {
      publicDetails: publicDatabaseError(error),
    });
  }
}

export async function savePortalWorkspace(workspace) {
  const identity = getPortalIdentity();
  const sql = getSql();

  if (!sql) {
    const error = new Error("DATABASE_URL is not configured.");
    error.publicDetails = {
      code: "database_not_configured",
      message: "Neon is not connected yet. Chat history is still being saved in this browser.",
    };
    throw error;
  }

  try {
    const serializedWorkspace = JSON.stringify(workspace);
    const rows = await sql`
      WITH client_row AS (
        INSERT INTO portal_clients (slug, display_name)
        VALUES (${identity.clientSlug}, ${identity.clientName})
        ON CONFLICT (slug) DO UPDATE
          SET display_name = EXCLUDED.display_name,
              updated_at = NOW()
        RETURNING id
      ),
      user_row AS (
        INSERT INTO portal_users (external_id)
        VALUES (${identity.userExternalId})
        ON CONFLICT (external_id) DO UPDATE
          SET updated_at = NOW()
        RETURNING id
      ),
      membership_row AS (
        INSERT INTO portal_memberships (client_id, user_id, role)
        SELECT client_row.id, user_row.id, 'member'
        FROM client_row, user_row
        ON CONFLICT (client_id, user_id) DO UPDATE
          SET updated_at = NOW()
        RETURNING client_id, user_id
      )
      INSERT INTO portal_workspace_snapshots (
        client_id,
        user_id,
        workspace,
        revision,
        updated_at
      )
      SELECT
        membership_row.client_id,
        membership_row.user_id,
        ${serializedWorkspace}::jsonb,
        1,
        NOW()
      FROM membership_row
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
    console.error("Portal workspace save failed", {
      code: error?.code,
      name: error?.name,
    });
    throw Object.assign(new Error(publicDatabaseError(error).message), {
      publicDetails: publicDatabaseError(error),
    });
  }
}

export async function getPortalAiContext() {
  const identity = getPortalIdentity();
  const sql = getSql();

  if (!sql) {
    return {
      clientName: identity.clientName,
      instructions: "",
      vectorStoreId: "",
    };
  }

  try {
    const rows = await sql`
      SELECT display_name, assistant_instructions, openai_vector_store_id
      FROM portal_clients
      WHERE slug = ${identity.clientSlug}
      LIMIT 1
    `;
    const row = rows[0];

    return {
      clientName: row?.display_name || identity.clientName,
      instructions: row?.assistant_instructions?.trim() || "",
      vectorStoreId: row?.openai_vector_store_id?.trim() || "",
    };
  } catch (error) {
    // A database configuration problem must not break the existing assistant.
    // The workspace endpoint still reports the actionable database error.
    console.error("Portal AI context load failed", {
      code: error?.code,
      name: error?.name,
    });
    return {
      clientName: identity.clientName,
      instructions: "",
      vectorStoreId: "",
    };
  }
}
