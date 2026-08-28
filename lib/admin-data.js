import "server-only";

import { neon } from "@neondatabase/serverless";

import { auth, createPortalAuth, isPortalAuthConfigured } from "@/lib/auth";

let sqlClient;

function adminError(code, message, status, data = {}) {
  return Object.assign(new Error(message), {
    publicDetails: { code, message, status, ...data },
  });
}

function getSql() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw adminError(
      "database_not_configured",
      "Neon is not connected yet.",
      503,
    );
  }

  sqlClient ||= neon(process.env.DATABASE_URL);
  return sqlClient;
}

function integer(value, minimum, maximum, label) {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw adminError(
      "invalid_admin_setting",
      `${label} must be a whole number from ${minimum.toLocaleString()} to ${maximum.toLocaleString()}.`,
      400,
    );
  }
  return parsed;
}

function cleanString(value, maximum, label, { required = false } = {}) {
  const result = typeof value === "string" ? value.trim() : "";
  if ((required && !result) || result.length > maximum) {
    throw adminError(
      "invalid_admin_setting",
      `${label} must contain ${required ? `1-${maximum}` : `0-${maximum}`} characters.`,
      400,
    );
  }
  return result;
}

function clientRecord(row) {
  const monthlyLimit = Number(row.monthly_prompt_limit) || 1;
  const requestsUsed = Number(row.requests_used) || 0;

  return {
    id: String(row.id),
    slug: row.slug,
    name: row.display_name,
    portalEnabled: row.portal_enabled !== false,
    aiEnabled: row.ai_enabled !== false,
    monthlyPromptLimit: monthlyLimit,
    requestsUsed,
    requestsRemaining: Math.max(0, monthlyLimit - requestsUsed),
    inputTokens: Number(row.input_tokens) || 0,
    outputTokens: Number(row.output_tokens) || 0,
    totalTokens: Number(row.total_tokens) || 0,
    periodStart: row.period_start || "",
    resetsAt: row.resets_at || "",
    assistantInstructions: row.assistant_instructions || "",
    vectorStoreId: row.openai_vector_store_id || "",
    memberCount: Number(row.member_count) || 0,
    conversationCount: Number(row.conversation_count) || 0,
    approvedKnowledge: Number(row.approved_knowledge) || 0,
    pendingKnowledge: Number(row.pending_knowledge) || 0,
    lastActivityAt: row.last_activity_at || "",
    createdAt: row.created_at || "",
    members: Array.isArray(row.members) ? row.members : [],
  };
}

async function queryAdminClients() {
  const sql = getSql();
  const rows = await sql`
    SELECT
      client.id,
      client.slug,
      client.display_name,
      client.portal_enabled,
      client.ai_enabled,
      client.monthly_prompt_limit,
      client.assistant_instructions,
      client.openai_vector_store_id,
      client.created_at,
      COALESCE(usage.requests_used, 0) AS requests_used,
      COALESCE(usage.input_tokens, 0) AS input_tokens,
      COALESCE(usage.output_tokens, 0) AS output_tokens,
      COALESCE(usage.total_tokens, 0) AS total_tokens,
      TO_CHAR(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_start,
      TO_CHAR(
        DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"'
      ) AS resets_at,
      COALESCE(member_stats.member_count, 0) AS member_count,
      COALESCE(member_stats.members, '[]'::jsonb) AS members,
      COALESCE(workspace_stats.conversation_count, 0) AS conversation_count,
      workspace_stats.last_activity_at,
      COALESCE(knowledge_stats.approved_knowledge, 0) AS approved_knowledge,
      COALESCE(knowledge_stats.pending_knowledge, 0) AS pending_knowledge
    FROM portal_clients AS client
    LEFT JOIN portal_ai_usage_monthly AS usage
      ON usage.client_id = client.id
     AND usage.period_start = DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS member_count,
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'name', portal_user.display_name,
            'email', portal_user.email,
            'username', auth_user.username,
            'role', membership.role
          )
          ORDER BY portal_user.display_name
        ) AS members
      FROM portal_memberships AS membership
      JOIN portal_users AS portal_user
        ON portal_user.id = membership.user_id
      LEFT JOIN "user" AS auth_user
        ON auth_user.id = portal_user.external_id
      WHERE membership.client_id = client.id
    ) AS member_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COALESCE(SUM(JSONB_ARRAY_LENGTH(snapshot.workspace -> 'threads')), 0)::int
          AS conversation_count,
        MAX(snapshot.updated_at) AS last_activity_at
      FROM portal_workspace_snapshots AS snapshot
      WHERE snapshot.client_id = client.id
    ) AS workspace_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE item.status = 'approved')::int AS approved_knowledge,
        COUNT(*) FILTER (WHERE item.status = 'pending')::int AS pending_knowledge
      FROM portal_knowledge_items AS item
      WHERE item.client_id = client.id
    ) AS knowledge_stats ON TRUE
    ORDER BY client.display_name ASC
  `;

  return rows.map(clientRecord);
}

export function adminErrorResponse(error) {
  const details = error?.publicDetails || {
    code: "admin_error",
    message: "The administrator request could not be completed.",
    status: 500,
  };

  return Response.json(
    {
      error: details.message,
      code: details.code,
      ...(details.client ? { client: details.client } : {}),
    },
    { status: details.status || 500 },
  );
}

export function assertTrustedAdminMutation(requestHeaders) {
  const configuredUrl = process.env.BETTER_AUTH_URL;
  const origin = requestHeaders?.get?.("origin") || "";

  try {
    if (!configuredUrl || !origin || new URL(origin).origin !== new URL(configuredUrl).origin) {
      throw new Error("origin mismatch");
    }
  } catch {
    throw adminError(
      "untrusted_admin_request",
      "The administrator request did not come from the configured portal origin.",
      403,
    );
  }
}

export async function resolveAdminContext(requestHeaders) {
  if (!isPortalAuthConfigured()) {
    throw adminError("auth_not_configured", "Portal login is not configured yet.", 503);
  }

  let session;
  try {
    session = await auth.api.getSession({ headers: requestHeaders });
  } catch {
    throw adminError("authentication_failed", "The login session could not be verified.", 503);
  }

  if (!session?.user?.id) {
    throw adminError("authentication_required", "Sign in to access the administrator portal.", 401);
  }

  const sql = getSql();
  const rows = await sql`
    SELECT
      portal_user.id,
      portal_user.display_name,
      administrator.role
    FROM portal_users AS portal_user
    JOIN portal_admins AS administrator
      ON administrator.user_id = portal_user.id
    WHERE portal_user.external_id = ${session.user.id}
      AND administrator.is_active = TRUE
    LIMIT 1
  `;

  if (!rows.length) {
    throw adminError(
      "administrator_required",
      "This account does not have active AOC administrator access.",
      403,
    );
  }

  return {
    session,
    admin: {
      id: String(rows[0].id),
      role: rows[0].role,
      name: rows[0].display_name || session.user.name || "AOC Administrator",
      username: session.user.username || "",
      email: session.user.email || "",
    },
  };
}

export async function loadAdminDashboard(requestHeaders) {
  const context = await resolveAdminContext(requestHeaders);
  const clients = await queryAdminClients();

  return {
    admin: context.admin,
    clients,
    summary: {
      totalClients: clients.length,
      activeClients: clients.filter((client) => client.portalEnabled).length,
      aiEnabledClients: clients.filter((client) => client.aiEnabled).length,
      requestsUsed: clients.reduce((total, client) => total + client.requestsUsed, 0),
      requestAllowance: clients.reduce(
        (total, client) => total + client.monthlyPromptLimit,
        0,
      ),
      conversations: clients.reduce(
        (total, client) => total + client.conversationCount,
        0,
      ),
    },
  };
}

export async function updateAdminClient(settings, requestHeaders) {
  await resolveAdminContext(requestHeaders);

  const slug = cleanString(settings?.slug, 100, "Client identifier", { required: true });
  const displayName = cleanString(settings?.name, 120, "Client name", { required: true });
  const assistantInstructions = cleanString(
    settings?.assistantInstructions,
    12000,
    "Assistant instructions",
  );
  const vectorStoreId = cleanString(
    settings?.vectorStoreId,
    200,
    "Vector store ID",
  );
  const monthlyPromptLimit = integer(
    settings?.monthlyPromptLimit,
    1,
    100000,
    "Monthly request limit",
  );

  if (typeof settings?.portalEnabled !== "boolean" || typeof settings?.aiEnabled !== "boolean") {
    throw adminError("invalid_admin_setting", "Portal and AI status must be enabled or disabled.", 400);
  }

  if (vectorStoreId && !/^vs_[A-Za-z0-9_-]+$/.test(vectorStoreId)) {
    throw adminError(
      "invalid_vector_store",
      "The vector store ID must be blank or begin with vs_.",
      400,
    );
  }

  const sql = getSql();
  const rows = await sql`
    UPDATE portal_clients
    SET
      display_name = ${displayName},
      portal_enabled = ${settings.portalEnabled},
      ai_enabled = ${settings.aiEnabled},
      monthly_prompt_limit = ${monthlyPromptLimit},
      assistant_instructions = ${assistantInstructions},
      openai_vector_store_id = ${vectorStoreId || null},
      updated_at = NOW()
    WHERE slug = ${slug}
    RETURNING slug
  `;

  if (!rows.length) {
    throw adminError("client_not_found", "The selected client no longer exists.", 404);
  }

  const clients = await queryAdminClients();
  return clients.find((client) => client.slug === slug);
}

export async function resetAdminClientUsage(slugValue, requestHeaders) {
  await resolveAdminContext(requestHeaders);
  const slug = cleanString(slugValue, 100, "Client identifier", { required: true });
  const sql = getSql();
  const clients = await sql`
    SELECT id FROM portal_clients WHERE slug = ${slug} LIMIT 1
  `;

  if (!clients.length) {
    throw adminError("client_not_found", "The selected client no longer exists.", 404);
  }

  await sql`
    DELETE FROM portal_ai_usage_monthly
    WHERE client_id = ${clients[0].id}
      AND period_start = DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date
  `;

  const refreshed = await queryAdminClients();
  return refreshed.find((client) => client.slug === slug);
}

export async function createAdminClient(input, requestHeaders) {
  await resolveAdminContext(requestHeaders);
  const username = cleanString(input?.username, 50, "Username", { required: true }).toLowerCase();
  const displayName = cleanString(input?.name, 120, "Client name", { required: true });
  const password = typeof input?.password === "string" ? input.password : "";
  const monthlyPromptLimit = integer(
    input?.monthlyPromptLimit,
    1,
    100000,
    "Monthly request limit",
  );

  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    throw adminError(
      "invalid_username",
      "Use 3-50 lowercase letters, numbers, dots, underscores, or hyphens.",
      400,
    );
  }

  if (password.length < 12 || password.length > 128) {
    throw adminError(
      "invalid_password",
      "Temporary client passwords must contain 12-128 characters.",
      400,
    );
  }

  const sql = getSql();
  const existing = await sql`
    SELECT 1 FROM portal_clients WHERE slug = ${username} LIMIT 1
  `;
  if (existing.length) {
    throw adminError("client_exists", "That client username already exists.", 409);
  }

  const provisioningAuth = createPortalAuth({
    allowAccountCreation: true,
    useNextCookies: false,
  });
  const email = `${username}@portal-users.invalid`;
  let authUserId = "";

  try {
    const result = await provisioningAuth.api.signUpEmail({
      body: { email, name: displayName, password, username },
    });
    authUserId = result?.user?.id || "";
    if (!authUserId) throw new Error("The authentication account was not returned.");

    await sql`
      WITH client_row AS (
        INSERT INTO portal_clients (
          slug,
          display_name,
          monthly_prompt_limit
        )
        VALUES (
          ${username},
          ${displayName},
          ${monthlyPromptLimit}
        )
        RETURNING id
      ),
      user_row AS (
        INSERT INTO portal_users (external_id, email, display_name)
        VALUES (${authUserId}, ${email}, ${displayName})
        RETURNING id
      )
      INSERT INTO portal_memberships (client_id, user_id, role)
      SELECT client_row.id, user_row.id, 'client_admin'
      FROM client_row, user_row
    `;
  } catch (error) {
    if (authUserId) {
      await sql`DELETE FROM "user" WHERE id = ${authUserId}`.catch(() => null);
    }
    if (error?.publicDetails) throw error;
    throw adminError(
      "client_creation_failed",
      error?.message || "The client account could not be created.",
      error?.status === 422 ? 409 : 500,
    );
  }

  const clients = await queryAdminClients();
  return clients.find((client) => client.slug === username);
}
