import "server-only";

import { auth, isPortalAuthConfigured } from "@/lib/auth";
import { clientPermissionsForRole, hasClientPermission } from "@/lib/client-permissions";
import { databaseSql } from "@/lib/database";
import { assertNotInternalUser } from "@/lib/internal-user-access";

export const ACTIVE_CLIENT_COOKIE = "aoc_active_client";

function portalError(code, message, status, data = {}) {
  return Object.assign(new Error(message), {
    publicDetails: { code, message, status, ...data },
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
      ? "The PostgreSQL database is connected, but its authentication or portal tables are missing. Run the setup migrations in the README."
      : connectionFailure
        ? "The portal could not connect to PostgreSQL. Check DATABASE_URL and try again."
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
      "PostgreSQL is not connected yet. Add DATABASE_URL to the server environment.",
      503,
    );
  }
  return databaseSql;
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
    {
      error: details.message,
      code: details.code,
      ...(details.usage ? { usage: details.usage } : {}),
    },
    { status: details.status || 500 },
  );
}

async function getPortalSession(requestHeaders) {
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

  await assertNotInternalUser(session.user.id);
  return session;
}

export async function resolvePortalContext(requestHeaders) {
  const session = await getPortalSession(requestHeaders);

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
        client.portal_enabled,
        client.ai_enabled,
        client.monthly_prompt_limit,
        client.assistant_instructions,
        client.openai_vector_store_id,
        client.approved_website_url,
        client.hubstaff_project_url,
        client.hubstaff_tracking_project_id,
        client.hubstaff_monthly_hours_limit,
        membership.role,
        synced_user.id AS portal_user_id
      FROM synced_user
      JOIN portal_memberships AS membership
        ON membership.user_id = synced_user.id AND membership.is_active = TRUE
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

  const enabledRows = rows.filter((row) => row.portal_enabled !== false);
  if (!enabledRows.length) {
    throw portalError(
      "client_portal_disabled",
      "This client portal is currently paused. Contact Always Open Commerce for access.",
      403,
    );
  }

  const requestedSlug = cookieValue(requestHeaders, ACTIVE_CLIENT_COOKIE);
  const selected = enabledRows.find((row) => row.slug === requestedSlug)
    || enabledRows[0];

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
      aiEnabled: selected.ai_enabled !== false,
      monthlyPromptLimit: Number(selected.monthly_prompt_limit) || 150,
      instructions: selected.assistant_instructions?.trim() || "",
      vectorStoreId: selected.openai_vector_store_id?.trim() || "",
      approvedWebsiteUrl: selected.approved_website_url?.trim() || "",
      hubstaffProjectUrl: selected.hubstaff_project_url?.trim() || "",
      hubstaffTrackingProjectId: Number.isSafeInteger(Number(selected.hubstaff_tracking_project_id))
        ? Number(selected.hubstaff_tracking_project_id)
        : null,
      hubstaffMonthlyHoursLimit: selected.hubstaff_monthly_hours_limit === null
        ? null
        : Number(selected.hubstaff_monthly_hours_limit),
    },
    permissions: clientPermissionsForRole(selected.role),
    memberships: enabledRows.map((row) => ({
      id: String(row.id),
      slug: row.slug,
      name: row.display_name,
      role: row.role,
    })),
  };
}

export async function requireClientPermission(requestHeaders, permission) {
  const context = await resolvePortalContext(requestHeaders);
  if (!hasClientPermission(context.client.role, permission)) {
    throw portalError("client_permission_denied", "This client role cannot perform that action.", 403);
  }
  return context;
}

export async function touchPortalPresence(requestHeaders) {
  const context = await resolvePortalContext(requestHeaders);
  const sql = getSql();

  try {
    await sql`
      UPDATE portal_memberships
      SET last_seen_at = NOW(),
          updated_at = NOW()
      WHERE client_id = ${context.client.id}
        AND user_id = ${context.user.id}
    `;
    return { seenAt: new Date().toISOString() };
  } catch (error) {
    throw databaseFailure(error, "presence heartbeat");
  }
}

export async function rememberHubstaffTrackingProjectId(
  clientId,
  hubstaffProjectUrl,
  trackingProjectId,
) {
  if (
    !/^[1-9][0-9]{0,18}$/.test(String(clientId || ""))
    || !Number.isSafeInteger(Number(trackingProjectId))
    || Number(trackingProjectId) <= 0
    || typeof hubstaffProjectUrl !== "string"
    || !hubstaffProjectUrl
  ) return false;

  const sql = getSql();
  const rows = await sql`
    UPDATE portal_clients
    SET hubstaff_tracking_project_id = ${Number(trackingProjectId)},
        updated_at = NOW()
    WHERE id = ${clientId}
      AND hubstaff_project_url = ${hubstaffProjectUrl}
      AND hubstaff_tracking_project_id IS DISTINCT FROM ${Number(trackingProjectId)}
    RETURNING id
  `;
  return rows.length > 0;
}

export async function loadPortalWorkspace(requestHeaders) {
  const context = await requireClientPermission(requestHeaders, "client.ai.use");
  const sql = getSql();

  try {
    const rows = await sql`
      SELECT
        workspace.workspace,
        COALESCE(workspace.revision, 0) AS revision,
        COALESCE(knowledge.approved, 0) AS approved,
        COALESCE(knowledge.pending, 0) AS pending,
        COALESCE(ai_usage.requests_used, 0) AS requests_used,
        TO_CHAR(
          DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ) AS resets_at
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
      LEFT JOIN portal_ai_usage_monthly AS ai_usage
        ON ai_usage.client_id = ${context.client.id}
       AND ai_usage.period_start = DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date
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
      ai: {
        enabled: context.client.aiEnabled,
        monthlyPromptLimit: context.client.monthlyPromptLimit,
        requestsUsed: Number(row.requests_used) || 0,
        requestsRemaining: Math.max(
          0,
          context.client.monthlyPromptLimit - (Number(row.requests_used) || 0),
        ),
        resetsAt: row.resets_at || "",
      },
    };
  } catch (error) {
    throw databaseFailure(error, "workspace load");
  }
}

export async function getPortalAiContext(requestHeaders) {
  const context = await requireClientPermission(requestHeaders, "client.ai.use");

  return {
    clientId: context.client.id,
    userId: context.user.id,
    clientName: context.client.name,
    aiEnabled: context.client.aiEnabled,
    monthlyPromptLimit: context.client.monthlyPromptLimit,
    instructions: context.client.instructions,
    vectorStoreId: context.client.vectorStoreId,
    approvedWebsiteUrl: context.client.approvedWebsiteUrl,
    hubstaffProjectUrl: context.client.hubstaffProjectUrl,
    hubstaffTrackingProjectId: context.client.hubstaffTrackingProjectId,
    hubstaffMonthlyHoursLimit: context.client.hubstaffMonthlyHoursLimit,
  };
}

export async function loadPortalConversationContext(clientId, userId, threadId) {
  if (
    !/^[1-9][0-9]{0,18}$/.test(String(clientId || ""))
    || !/^[1-9][0-9]{0,18}$/.test(String(userId || ""))
    || !/^thr_[a-f0-9]{32}$/i.test(String(threadId || ""))
  ) return "";

  const sql = getSql();
  const rows = await sql`
    SELECT data
    FROM portal_chatkit_items
    WHERE client_id = ${clientId}
      AND user_id = ${userId}
      AND thread_id = ${threadId}
      AND data->>'type' IN ('user_message', 'assistant_message')
    ORDER BY sequence DESC
    LIMIT 8
  `;

  return rows
    .reverse()
    .map((row) => {
      const message = row.data && typeof row.data === "object" ? row.data : {};
      const content = Array.isArray(message.content) ? message.content : [];
      const text = content
        .filter((part) => ["input_text", "output_text"].includes(part?.type) && typeof part.text === "string")
        .map((part) => part.text)
        .join("\n")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 2_000);
      if (!text) return "";
      return `${message.type === "user_message" ? "User" : "Assistant"}: ${text}`;
    })
    .filter(Boolean)
    .join("\n")
    .slice(-6_000);
}

export async function loadPortalConversationMode(clientId, userId, threadId) {
  if (!/^[1-9][0-9]{0,18}$/.test(String(clientId || ""))
    || !/^[1-9][0-9]{0,18}$/.test(String(userId || ""))
    || !validChatKitThreadId(threadId)) return null;
  const sql = getSql();
  const rows = await sql`SELECT chat_mode FROM portal_chatkit_threads
    WHERE client_id=${clientId} AND user_id=${userId} AND id=${threadId}`;
  return rows[0]?.chat_mode || null;
}

function validChatKitThreadId(value) {
  return /^thr_[a-f0-9]{32}$/i.test(String(value || ""));
}

export async function listPortalConversations(requestHeaders, mode = "work") {
  if (mode !== "work" && mode !== "general") {
    throw portalError("invalid_chat_mode", "Choose Work questions or General chat.", 400);
  }
  const context = await requireClientPermission(requestHeaders, "client.ai.use");
  const sql = getSql();

  try {
    const rows = await sql`
      SELECT
        thread.id,
        COALESCE(NULLIF(BTRIM(thread.data->>'title'), ''), 'New conversation') AS title,
        thread.created_at,
        thread.chat_mode,
        COUNT(item.id)::integer AS message_count
      FROM portal_chatkit_threads AS thread
      LEFT JOIN portal_chatkit_items AS item
        ON item.client_id = thread.client_id
       AND item.user_id = thread.user_id
       AND item.thread_id = thread.id
      WHERE thread.client_id = ${context.client.id}
        AND thread.user_id = ${context.user.id}
        AND thread.chat_mode = ${mode}
      GROUP BY thread.client_id, thread.user_id, thread.id, thread.data, thread.created_at, thread.chat_mode
      ORDER BY thread.created_at DESC, thread.id DESC
      LIMIT 50
    `;

    return rows.map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      messageCount: Number(row.message_count) || 0,
      mode: row.chat_mode,
    }));
  } catch (error) {
    throw databaseFailure(error, "conversation history load");
  }
}

export async function renamePortalConversation(requestHeaders, threadId, title) {
  if (!validChatKitThreadId(threadId)) {
    throw portalError("invalid_conversation", "That conversation is not valid.", 400);
  }

  const nextTitle = typeof title === "string" ? title.trim() : "";
  if (!nextTitle || nextTitle.length > 100) {
    throw portalError(
      "invalid_conversation_title",
      "Conversation names must be between 1 and 100 characters.",
      400,
    );
  }

  const context = await requireClientPermission(requestHeaders, "client.ai.use");
  const sql = getSql();

  try {
    const rows = await sql`
      UPDATE portal_chatkit_threads
      SET data = jsonb_set(data, '{title}', to_jsonb(${nextTitle}::text), true)
      WHERE client_id = ${context.client.id}
        AND user_id = ${context.user.id}
        AND id = ${threadId}
      RETURNING id
    `;
    if (!rows.length) {
      throw portalError("conversation_not_found", "That conversation is no longer available.", 404);
    }
    return { id: threadId, title: nextTitle };
  } catch (error) {
    if (error?.publicDetails) throw error;
    throw databaseFailure(error, "conversation rename");
  }
}

export async function deletePortalConversation(requestHeaders, threadId) {
  if (!validChatKitThreadId(threadId)) {
    throw portalError("invalid_conversation", "That conversation is not valid.", 400);
  }

  const context = await requireClientPermission(requestHeaders, "client.ai.use");
  const sql = getSql();

  try {
    const rows = await sql`
      DELETE FROM portal_chatkit_threads
      WHERE client_id = ${context.client.id}
        AND user_id = ${context.user.id}
        AND id = ${threadId}
      RETURNING id
    `;
    if (!rows.length) {
      throw portalError("conversation_not_found", "That conversation is no longer available.", 404);
    }
  } catch (error) {
    if (error?.publicDetails) throw error;
    throw databaseFailure(error, "conversation delete");
  }
}

function aiUsageDetails(context, row = {}) {
  const requestsUsed = Number(row.requests_used) || 0;
  return {
    enabled: context.aiEnabled,
    monthlyPromptLimit: context.monthlyPromptLimit,
    requestsUsed,
    requestsRemaining: Math.max(0, context.monthlyPromptLimit - requestsUsed),
    periodStart: row.period_start || "",
    resetsAt: row.resets_at || "",
  };
}

export async function loadPortalAiAccess(requestHeaders) {
  const context = await requireClientPermission(requestHeaders, "client.ai.use");
  const sql = getSql();

  try {
    const rows = await sql`
      SELECT
        client.ai_enabled,
        client.monthly_prompt_limit,
        COALESCE(usage.requests_used, 0) AS requests_used,
        TO_CHAR(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_start,
        TO_CHAR(
          DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month',
          'YYYY-MM-DD"T"HH24:MI:SS"Z"'
        ) AS resets_at
      FROM portal_users AS portal_user
      JOIN portal_memberships AS membership
        ON membership.user_id = portal_user.id
      JOIN portal_clients AS client
        ON client.id = membership.client_id
      LEFT JOIN portal_ai_usage_monthly AS usage
        ON usage.client_id = client.id
       AND usage.period_start = DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date
      WHERE portal_user.external_id = ${context.user.externalId}
        AND membership.client_id = ${context.client.id}
        AND membership.is_active = TRUE
        AND client.portal_enabled = TRUE
      LIMIT 1
    `;

    if (!rows.length) {
      throw portalError(
        "client_portal_unavailable",
        "No active client portal is available for this login.",
        403,
      );
    }

    return aiUsageDetails(
      {
        aiEnabled: rows[0].ai_enabled !== false,
        monthlyPromptLimit: Number(rows[0].monthly_prompt_limit) || 150,
      },
      rows[0],
    );
  } catch (error) {
    if (error?.publicDetails) throw error;
    throw databaseFailure(error, "AI access status load");
  }
}
