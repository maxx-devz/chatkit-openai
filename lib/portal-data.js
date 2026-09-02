import "server-only";

import { neon } from "@neondatabase/serverless";

import { auth, isPortalAuthConfigured } from "@/lib/auth";

export const ACTIVE_CLIENT_COOKIE = "aoc_active_client";

let sqlClient;

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
        client.hubstaff_project_url,
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
      hubstaffProjectUrl: selected.hubstaff_project_url?.trim() || "",
    },
    memberships: enabledRows.map((row) => ({
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
        COALESCE(knowledge.pending, 0) AS pending,
        COALESCE(ai_usage.requests_used, 0) AS requests_used,
        COALESCE(ai_usage.input_tokens, 0) AS input_tokens,
        COALESCE(ai_usage.output_tokens, 0) AS output_tokens,
        COALESCE(ai_usage.total_tokens, 0) AS total_tokens,
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
        inputTokens: Number(row.input_tokens) || 0,
        outputTokens: Number(row.output_tokens) || 0,
        totalTokens: Number(row.total_tokens) || 0,
        resetsAt: row.resets_at || "",
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
    clientId: context.client.id,
    userId: context.user.id,
    clientName: context.client.name,
    aiEnabled: context.client.aiEnabled,
    monthlyPromptLimit: context.client.monthlyPromptLimit,
    instructions: context.client.instructions,
    vectorStoreId: context.client.vectorStoreId,
  };
}

function aiUsageDetails(context, row = {}) {
  const requestsUsed = Number(row.requests_used) || 0;
  return {
    enabled: context.aiEnabled,
    monthlyPromptLimit: context.monthlyPromptLimit,
    requestsUsed,
    requestsRemaining: Math.max(0, context.monthlyPromptLimit - requestsUsed),
    inputTokens: Number(row.input_tokens) || 0,
    outputTokens: Number(row.output_tokens) || 0,
    totalTokens: Number(row.total_tokens) || 0,
    periodStart: row.period_start || "",
    resetsAt: row.resets_at || "",
  };
}

export async function loadPortalAiAccess(requestHeaders) {
  const session = await getPortalSession(requestHeaders);
  const sql = getSql();
  const requestedSlug = cookieValue(requestHeaders, ACTIVE_CLIENT_COOKIE);

  try {
    const rows = await sql`
      SELECT
        client.ai_enabled,
        client.monthly_prompt_limit,
        COALESCE(usage.requests_used, 0) AS requests_used,
        COALESCE(usage.input_tokens, 0) AS input_tokens,
        COALESCE(usage.output_tokens, 0) AS output_tokens,
        COALESCE(usage.total_tokens, 0) AS total_tokens,
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
      WHERE portal_user.external_id = ${session.user.id}
        AND client.portal_enabled = TRUE
      ORDER BY
        CASE WHEN client.slug = ${requestedSlug} THEN 0 ELSE 1 END,
        client.display_name ASC
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

export async function reservePortalAiRequest(context) {
  const sql = getSql();
  const rows = await sql`
    INSERT INTO portal_ai_usage_monthly (
      client_id,
      period_start,
      requests_used,
      updated_at
    )
    SELECT
      ${context.clientId},
      DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date,
      1,
      NOW()
    FROM portal_clients AS client
    WHERE client.id = ${context.clientId}
      AND client.portal_enabled = TRUE
      AND client.ai_enabled = TRUE
      AND client.monthly_prompt_limit >= 1
    ON CONFLICT (client_id, period_start) DO UPDATE
      SET requests_used = portal_ai_usage_monthly.requests_used + 1,
          updated_at = NOW()
      WHERE portal_ai_usage_monthly.requests_used < (
        SELECT monthly_prompt_limit
        FROM portal_clients
        WHERE id = ${context.clientId}
      )
    RETURNING
      requests_used,
      input_tokens,
      output_tokens,
      total_tokens,
      TO_CHAR(period_start, 'YYYY-MM-DD') AS period_start,
      TO_CHAR(period_start + INTERVAL '1 month', 'YYYY-MM-DD"T"HH24:MI:SS"Z"') AS resets_at
  `;

  if (rows.length) return aiUsageDetails(context, rows[0]);

  const current = await sql`
    SELECT
      client.ai_enabled,
      client.monthly_prompt_limit,
      COALESCE(usage.requests_used, 0) AS requests_used,
      COALESCE(usage.input_tokens, 0) AS input_tokens,
      COALESCE(usage.output_tokens, 0) AS output_tokens,
      COALESCE(usage.total_tokens, 0) AS total_tokens,
      TO_CHAR(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_start,
      TO_CHAR(
        DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"'
      ) AS resets_at
    FROM portal_clients AS client
    LEFT JOIN portal_ai_usage_monthly AS usage
      ON usage.client_id = client.id
     AND usage.period_start = DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date
    WHERE client.id = ${context.clientId}
    LIMIT 1
  `;
  const refreshedContext = {
    ...context,
    aiEnabled: current[0]?.ai_enabled !== false,
    monthlyPromptLimit:
      Number(current[0]?.monthly_prompt_limit) || context.monthlyPromptLimit,
  };
  const usage = aiUsageDetails(refreshedContext, current[0]);

  throw portalError(
    refreshedContext.aiEnabled
      ? "client_monthly_request_limit_reached"
      : "client_ai_disabled",
    refreshedContext.aiEnabled
      ? "This client has reached its monthly AI request allowance. Contact Always Open Commerce to adjust the limit."
      : "The AI assistant is currently paused for this client. Contact Always Open Commerce.",
    refreshedContext.aiEnabled ? 429 : 403,
    { usage },
  );
}

export async function recordPortalAiTokens(clientId, periodStart, usage) {
  if (
    !usage
    || !Number.isSafeInteger(usage.inputTokens)
    || !Number.isSafeInteger(usage.outputTokens)
    || !Number.isSafeInteger(usage.totalTokens)
  ) {
    return;
  }

  const sql = getSql();
  await sql`
    UPDATE portal_ai_usage_monthly
    SET input_tokens = input_tokens + ${usage.inputTokens},
        output_tokens = output_tokens + ${usage.outputTokens},
        total_tokens = total_tokens + ${usage.totalTokens},
        updated_at = NOW()
    WHERE client_id = ${clientId}
      AND period_start = ${periodStart}::date
  `;
}
