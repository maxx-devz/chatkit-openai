import "server-only";

import { auth, createPortalAuth, isPortalAuthConfigured } from "@/lib/auth";
import { databasePool, databaseSql } from "@/lib/database";
import { assertNotInternalUser } from "@/lib/internal-user-access";
import { requireInternalUserPermission } from "@/lib/internal-user-data";
import { canManageInternalRole, hasInternalPermission, INTERNAL_ASSIGNABLE_ROLE_IDS } from "@/lib/internal-permissions";
import {
  hasUnsafeMultilineText,
  hasUnsafePlainText,
  passwordValidationMessage,
} from "@/lib/input-validation";
import { normalizeHubstaffProjectUrl } from "@/lib/hubstaff";
import { listActiveHubstaffMembers } from "@/lib/internal-hubstaff-members";
import { auditInternalAction } from '@/lib/internal-panel-audit';
import { normalizeApprovedWebsiteUrl } from "@/lib/client-website";
import {
  INTERNAL_HR_PANEL_IDS,
  INTERNAL_PM_PANEL_IDS,
  INTERNAL_USER_PANELS,
  internalUserPanelAccess,
  internalUserPosition,
  isInternalUserPosition,
} from "@/lib/internal-user-positions";

function adminError(code, message, status, data = {}) {
  return Object.assign(new Error(message), {
    publicDetails: { code, message, status, ...data },
  });
}

function getSql() {
  if (!process.env.DATABASE_URL?.trim()) {
    throw adminError(
      "database_not_configured",
      "The PostgreSQL database is not connected yet.",
      503,
    );
  }

  return databaseSql;
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

function cleanString(
  value,
  maximum,
  label,
  { required = false, multiline = false } = {},
) {
  const result = typeof value === "string" ? value.trim() : "";
  const unsafe = multiline
    ? hasUnsafeMultilineText(result)
    : hasUnsafePlainText(result);
  if ((required && !result) || result.length > maximum || unsafe) {
    throw adminError(
      "invalid_admin_setting",
      unsafe
        ? `${label} contains unsupported control or markup characters.`
        : `${label} must contain ${required ? `1-${maximum}` : `0-${maximum}`} characters.`,
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
    periodStart: row.period_start || "",
    resetsAt: row.resets_at || "",
    vectorStoreId: row.openai_vector_store_id || "",
    approvedWebsiteUrl: row.approved_website_url || "",
    hubstaffProjectUrl: row.hubstaff_project_url || "",
    hubstaffMonthlyHoursLimit: row.hubstaff_monthly_hours_limit === null
      ? null
      : Number(row.hubstaff_monthly_hours_limit),
    memberCount: Number(row.member_count) || 0,
    conversationCount: Number(row.conversation_count) || 0,
    approvedKnowledge: Number(row.approved_knowledge) || 0,
    pendingKnowledge: Number(row.pending_knowledge) || 0,
    lastActivityAt: row.last_activity_at || "",
    lastSeenAt: row.last_seen_at || "",
    isOnline: row.is_online === true,
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
      client.openai_vector_store_id,
      client.approved_website_url,
      client.hubstaff_project_url,
      client.hubstaff_monthly_hours_limit,
      client.created_at,
      COALESCE(usage.requests_used, 0) AS requests_used,
      TO_CHAR(DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS period_start,
      TO_CHAR(
        DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC') + INTERVAL '1 month',
        'YYYY-MM-DD"T"HH24:MI:SS"Z"'
      ) AS resets_at,
      COALESCE(member_stats.member_count, 0) AS member_count,
      COALESCE(member_stats.members, '[]'::jsonb) AS members,
      member_stats.last_seen_at,
      COALESCE(member_stats.last_seen_at >= NOW() - INTERVAL '60 seconds', FALSE) AS is_online,
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
        MAX(membership.last_seen_at) AS last_seen_at,
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

function internalUserRecord(row) {
  const position = internalUserPosition(row.position);
  return {
    id: String(row.user_id),
    username: row.username || "",
    name: row.display_name,
    email: row.email || "",
    position: position.id,
    positionLabel: position.label,
    roles: Array.isArray(row.roles) ? row.roles : [],
    panelAccess: internalUserPanelAccess(row.panel_access, position.id),
    active: row.is_active === true,
    hubstaffUserId: String(row.hubstaff_user_id),
    connected: row.connected === true,
    lastSyncedAt: row.last_synced_at || "",
    createdAt: row.created_at || "",
  };
}

async function queryAdminInternalUsers() {
  const sql = getSql();
  const relation = await sql`SELECT to_regclass('portal_internal_users') AS users,
    to_regclass('portal_internal_user_roles') AS roles,
    to_regclass('portal_internal_access_audit') AS audit`;
  if (!relation[0]?.users || !relation[0]?.roles || !relation[0]?.audit) {
    return { internalUsers: [], schemaReady: false };
  }

  try {
    const rows = await sql`
      SELECT
        internalUser.user_id,
        internalUser.hubstaff_user_id,
        internalUser.position,
        internalUser.panel_access,
        internalUser.is_active,
        internalUser.encrypted_access_token IS NOT NULL AS connected,
        internalUser.last_synced_at,
        internalUser.created_at,
        ARRAY(SELECT role_key FROM portal_internal_user_roles r
          WHERE r.user_id=internalUser.user_id ORDER BY role_key) AS roles,
        portal_user.display_name,
        portal_user.email,
        auth_user.username
      FROM portal_internal_users AS internalUser
      JOIN portal_users AS portal_user
        ON portal_user.id = internalUser.user_id
      LEFT JOIN "user" AS auth_user
        ON auth_user.id = portal_user.external_id
      ORDER BY portal_user.display_name ASC
    `;
    return { internalUsers: rows.map(internalUserRecord), schemaReady: true };
  } catch (error) {
    if (error?.code === "42703") return { internalUsers: [], schemaReady: false };
    throw error;
  }
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

  await assertNotInternalUser(session.user.id);
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

export async function loadAdminPresence(requestHeaders) {
  await resolveAdminContext(requestHeaders);
  const sql = getSql();
  const rows = await sql`
    SELECT
      client.slug,
      MAX(membership.last_seen_at) AS last_seen_at,
      COALESCE(
        BOOL_OR(membership.last_seen_at >= NOW() - INTERVAL '60 seconds'),
        FALSE
      ) AS is_online
    FROM portal_clients AS client
    LEFT JOIN portal_memberships AS membership
      ON membership.client_id = client.id
    GROUP BY client.id, client.slug
    ORDER BY client.slug
  `;

  return rows.map((row) => ({
    slug: row.slug,
    lastSeenAt: row.last_seen_at || "",
    isOnline: row.is_online === true,
  }));
}

export async function loadAdminAssistantClient(slugValue, requestHeaders) {
  await resolveAdminContext(requestHeaders);

  const slug = cleanString(slugValue, 50, "Client identifier");
  if (!slug) return null;
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(slug)) {
    throw adminError(
      "invalid_client_identifier",
      "The selected client identifier is invalid.",
      400,
    );
  }

  const sql = getSql();
  const rows = await sql`
    SELECT
      client.slug,
      client.display_name,
      client.assistant_instructions,
      client.openai_vector_store_id,
      client.approved_website_url,
      client.hubstaff_project_url,
      client.portal_enabled,
      client.ai_enabled,
      client.monthly_prompt_limit,
      COALESCE(usage.requests_used, 0) AS requests_used,
      COALESCE(member_stats.member_count, 0) AS member_count,
      member_stats.last_seen_at,
      COALESCE(member_stats.last_seen_at >= NOW() - INTERVAL '60 seconds', FALSE) AS is_online,
      COALESCE(chat_stats.conversation_count, 0) AS conversation_count,
      COALESCE(knowledge_stats.approved_knowledge, 0) AS approved_knowledge,
      COALESCE(knowledge_stats.pending_knowledge, 0) AS pending_knowledge
    FROM portal_clients AS client
    LEFT JOIN portal_ai_usage_monthly AS usage
      ON usage.client_id = client.id
     AND usage.period_start = DATE_TRUNC('month', NOW() AT TIME ZONE 'UTC')::date
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*)::int AS member_count,
        MAX(membership.last_seen_at) AS last_seen_at
      FROM portal_memberships AS membership
      WHERE membership.client_id = client.id
    ) AS member_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::int AS conversation_count
      FROM portal_chatkit_threads AS thread
      WHERE thread.client_id = client.id
    ) AS chat_stats ON TRUE
    LEFT JOIN LATERAL (
      SELECT
        COUNT(*) FILTER (WHERE item.status = 'approved')::int AS approved_knowledge,
        COUNT(*) FILTER (WHERE item.status = 'pending')::int AS pending_knowledge
      FROM portal_knowledge_items AS item
      WHERE item.client_id = client.id
    ) AS knowledge_stats ON TRUE
    WHERE client.slug = ${slug}
    LIMIT 1
  `;

  if (!rows.length) {
    throw adminError("client_not_found", "The selected client no longer exists.", 404);
  }

  const row = rows[0];
  const monthlyPromptLimit = Number(row.monthly_prompt_limit) || 1;
  const requestsUsed = Number(row.requests_used) || 0;

  return {
    slug: row.slug,
    name: row.display_name,
    instructions: row.assistant_instructions || "",
    vectorStoreId: row.openai_vector_store_id || "",
    approvedWebsiteUrl: row.approved_website_url || "",
    hubstaffProjectUrl: row.hubstaff_project_url || "",
    portalEnabled: row.portal_enabled !== false,
    aiEnabled: row.ai_enabled !== false,
    monthlyPromptLimit,
    requestsUsed,
    requestsRemaining: Math.max(0, monthlyPromptLimit - requestsUsed),
    memberCount: Number(row.member_count) || 0,
    conversationCount: Number(row.conversation_count) || 0,
    approvedKnowledge: Number(row.approved_knowledge) || 0,
    pendingKnowledge: Number(row.pending_knowledge) || 0,
    lastSeenAt: row.last_seen_at || "",
    isOnline: row.is_online === true,
  };
}

export async function updateAdminClient(settings, requestHeaders) {
  await resolveAdminContext(requestHeaders);

  const slug = cleanString(settings?.slug, 100, "Client identifier", { required: true });
  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(slug)) {
    throw adminError(
      "invalid_client_identifier",
      "The client identifier must use 3-50 lowercase letters, numbers, dots, underscores, or hyphens.",
      400,
    );
  }
  const displayName = cleanString(settings?.name, 120, "Client name", { required: true });
  const vectorStoreId = cleanString(
    settings?.vectorStoreId,
    200,
    "Vector store ID",
  );
  const approvedWebsiteUrlInput = cleanString(
    settings?.approvedWebsiteUrl,
    500,
    "Approved website URL",
  );
  let approvedWebsiteUrl;
  try { approvedWebsiteUrl = normalizeApprovedWebsiteUrl(approvedWebsiteUrlInput); }
  catch (error) {
    throw adminError("invalid_approved_website", error.message, 400);
  }
  const hubstaffProjectUrlInput = cleanString(
    settings?.hubstaffProjectUrl,
    500,
    "Hubstaff project URL",
  );
  const hubstaffProjectUrl = normalizeHubstaffProjectUrl(hubstaffProjectUrlInput);
  const hubstaffMonthlyHoursLimit = settings?.hubstaffMonthlyHoursLimit === null
    || settings?.hubstaffMonthlyHoursLimit === ""
    || settings?.hubstaffMonthlyHoursLimit === undefined
    ? null
    : Number(settings.hubstaffMonthlyHoursLimit);
  if (
    hubstaffMonthlyHoursLimit !== null
    && (!Number.isFinite(hubstaffMonthlyHoursLimit)
      || hubstaffMonthlyHoursLimit <= 0
      || hubstaffMonthlyHoursLimit > 100000)
  ) {
    throw adminError(
      "invalid_hubstaff_hours_limit",
      "The monthly Hubstaff hours limit must be blank or between 0.01 and 100,000 hours.",
      400,
    );
  }
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
      openai_vector_store_id = ${vectorStoreId || null},
      approved_website_url = ${approvedWebsiteUrl || null},
      hubstaff_tracking_project_id = CASE
        WHEN hubstaff_project_url IS NOT DISTINCT FROM ${hubstaffProjectUrl || null}
          THEN hubstaff_tracking_project_id
        ELSE NULL
      END,
      hubstaff_project_url = ${hubstaffProjectUrl || null},
      hubstaff_monthly_hours_limit = ${hubstaffMonthlyHoursLimit},
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
  const approvedWebsiteUrlInput = cleanString(
    input?.approvedWebsiteUrl,
    500,
    "Approved website URL",
  );
  let approvedWebsiteUrl;
  try { approvedWebsiteUrl = normalizeApprovedWebsiteUrl(approvedWebsiteUrlInput); }
  catch (error) {
    throw adminError("invalid_approved_website", error.message, 400);
  }
  const hubstaffProjectUrlInput = cleanString(
    input?.hubstaffProjectUrl,
    500,
    "Hubstaff project URL",
  );
  const hubstaffProjectUrl = normalizeHubstaffProjectUrl(hubstaffProjectUrlInput);
  const hubstaffMonthlyHoursLimit = input?.hubstaffMonthlyHoursLimit === null
    || input?.hubstaffMonthlyHoursLimit === ""
    || input?.hubstaffMonthlyHoursLimit === undefined
    ? null
    : Number(input.hubstaffMonthlyHoursLimit);
  if (
    hubstaffMonthlyHoursLimit !== null
    && (!Number.isFinite(hubstaffMonthlyHoursLimit)
      || hubstaffMonthlyHoursLimit <= 0
      || hubstaffMonthlyHoursLimit > 100000)
  ) {
    throw adminError(
      "invalid_hubstaff_hours_limit",
      "The monthly Hubstaff hours limit must be blank or between 0.01 and 100,000 hours.",
      400,
    );
  }

  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    throw adminError(
      "invalid_username",
      "Use 3-50 lowercase letters, numbers, dots, underscores, or hyphens.",
      400,
    );
  }

  const passwordError = passwordValidationMessage(password, username);
  if (passwordError) {
    throw adminError(
      "invalid_password",
      passwordError,
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
          monthly_prompt_limit,
          approved_website_url,
          hubstaff_project_url,
          hubstaff_monthly_hours_limit
        )
        VALUES (
          ${username},
          ${displayName},
          ${monthlyPromptLimit},
          ${approvedWebsiteUrl || null},
          ${hubstaffProjectUrl || null},
          ${hubstaffMonthlyHoursLimit}
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
      error?.status === 422
        ? "That username or email is already in use."
        : "The client account could not be created.",
      error?.status === 422 ? 409 : 500,
    );
  }

  const clients = await queryAdminClients();
  return clients.find((client) => client.slug === username);
}

function internalUserSettings(input, { creating = false } = {}) {
  const name = cleanString(input?.name, 120, "Internal user name", { required: true });
  const position = cleanString(input?.position, 60, "Internal user position", { required: true });
  if (!isInternalUserPosition(position)) {
    throw adminError(
      "invalid_internal_user_position",
      "Select a supported internal user position.",
      400,
    );
  }

  const rawPanels = input?.panelAccess === undefined && creating
    ? internalUserPosition(position).panels
    : input?.panelAccess;
  if (!Array.isArray(rawPanels)) {
    throw adminError("invalid_internal_user_panels", "Provide an internal portal panel list.", 400);
  }
  const panels = internalUserPanelAccess(rawPanels, position);
  const allowedPanels = new Set(INTERNAL_USER_PANELS.map(panel => panel.id));
  if (
    rawPanels.some(panel => !allowedPanels.has(panel))
    || new Set(rawPanels).size !== rawPanels.length
  ) {
    throw adminError(
      "invalid_internal_user_panels",
      "Internal user panel access contains an unsupported or duplicate selection.",
      400,
    );
  }

  const hubstaffUserId = String(input?.hubstaffUserId ?? "").trim();
  if (!/^[1-9][0-9]{0,18}$/.test(hubstaffUserId)
    || BigInt(hubstaffUserId) > 9_223_372_036_854_775_807n) {
    throw adminError(
      "invalid_hubstaff_user",
      "Hubstaff user ID must be a positive numeric ID.",
      400,
    );
  }

  const active = creating ? true : input?.active;
  if (typeof active !== "boolean") {
    throw adminError("invalid_internal_user_status", "Internal portal status must be enabled or disabled.", 400);
  }

  return { name, position, panels, hubstaffUserId, active };
}

async function requireInternalUserAdminSchema() {
  const result = await queryAdminInternalUsers();
  if (!result.schemaReady) {
    throw adminError(
      "internal_user_schema_required",
      "Internal User Controls need the latest internal user migration. Run npm run internal-user:migrate.",
      503,
    );
  }
  return result.internalUsers;
}

function assertTerminalOnlyRoleAssignment(input) {
  if (['role', 'roles', 'roleKey', 'role_key', 'permissions'].some(key => Object.hasOwn(input || {}, key))) {
    throw adminError('role_assignment_terminal_only',
      'Use the role controls in Internal Settings or the owner-controlled terminal command.', 400);
  }
}

export async function loadAdminInternalUsers(requestHeaders) {
  const actor = await requireInternalUserPermission(requestHeaders, 'internal_users.read');
  const result = await queryAdminInternalUsers();
  if (result.schemaReady) await auditInternalAction(databasePool, actor.internalUser.user_id,
    'internal_settings.read');
  return {
    internalUsers: result.internalUsers,
    schemaReady: result.schemaReady,
    canManage: hasInternalPermission(actor.profile, 'internal_users.profile.update'),
    canManageOwnAccount: actor.profile.roles.includes('internal_admin'),
    canManageRoles: hasInternalPermission(actor.profile, 'internal_users.roles.manage'),
    canResetPasswords: hasInternalPermission(actor.profile, 'internal_users.password.reset'),
    isInternalAdmin: actor.profile.roles.includes('internal_admin'),
    viewerId: String(actor.internalUser.user_id),
  };
}

export async function loadAvailableAdminHubstaffMembers(requestHeaders, { aocOnly = true } = {}) {
  const actor = await requireInternalUserPermission(requestHeaders, 'internal_users.create');
  const internalUsers = await requireInternalUserAdminSchema();
  const assigned = new Set(internalUsers.map(user => user.hubstaffUserId));
  const members = await listActiveHubstaffMembers({ aocOnly });
  await auditInternalAction(databasePool, actor.internalUser.user_id, 'internal_settings.hubstaff_members.read');
  return members.filter(member => !assigned.has(member.id));
}

async function assertActiveHubstaffMember(hubstaffUserId) {
  const members = await listActiveHubstaffMembers({ aocOnly: false });
  if (!members.some(member => member.id === hubstaffUserId)) {
    throw adminError('hubstaff_member_unavailable',
      'Select an active, unmapped member of the Hubstaff organization.', 409);
  }
}

export async function updateInternalUserRole(input, requestHeaders) {
  const actor = await requireInternalUserPermission(requestHeaders, 'internal_users.roles.manage');
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== 3
    || !['id', 'role', 'assigned'].every(key => Object.hasOwn(input, key))) {
    throw adminError('invalid_role_assignment', 'Select one account, role, and assignment action.', 400);
  }
  const targetId = String(input.id ?? '').trim();
  if (!/^[1-9][0-9]{0,18}$/.test(targetId)) {
    throw adminError('invalid_internal_user_identifier', 'The selected internal user is invalid.', 400);
  }
  if (!INTERNAL_ASSIGNABLE_ROLE_IDS.includes(input.role) || typeof input.assigned !== 'boolean') {
    throw adminError('invalid_role_assignment', 'Select an assignable internal role and action.', 400);
  }
  let client;
  try {
    client = await databasePool.connect();
    await client.query('BEGIN');
    await client.query('LOCK TABLE portal_internal_user_roles IN SHARE ROW EXCLUSIVE MODE');
    const manager = await client.query(`SELECT r.role_key FROM portal_internal_user_roles r
      JOIN portal_internal_users e ON e.user_id=r.user_id
      WHERE r.user_id=$1 AND r.role_key IN ('internal_access_manager','internal_admin')
        AND e.is_active=TRUE`, [actor.internalUser.user_id]);
    if (!manager.rows.length) {
      throw adminError('permission_forbidden', 'An active access-management role is required.', 403);
    }
    const actorRoles = manager.rows.map(row => row.role_key);
    if (targetId === String(actor.internalUser.user_id)
      && (input.role === 'internal_access_manager' || actorRoles.includes('internal_admin'))) {
      throw adminError('self_management_forbidden',
        'Only an Internal Access Manager may change their own business roles in Internal Settings.', 403);
    }
    if (!canManageInternalRole(actorRoles, input.role, input.assigned ? 'grant' : 'revoke')) {
      if (input.role === 'internal_access_manager') {
        throw adminError('protected_role_forbidden',
          'This protected role cannot be changed by your account. Contact a portal owner or use the owner-controlled terminal command.', 403);
      }
      throw adminError('permission_forbidden', 'This internal role does not permit that change.', 403);
    }
    const target = await client.query('SELECT is_active FROM portal_internal_users WHERE user_id=$1 FOR UPDATE', [targetId]);
    if (!target.rows.length) throw adminError('internal_user_not_found', 'The selected internal user no longer exists.', 404);
    if (input.assigned && !target.rows[0].is_active) {
      throw adminError('inactive_internal_user', 'Activate this internal user before granting a role.', 409);
    }
    if (!input.assigned && input.role === 'internal_access_manager' && target.rows[0].is_active) {
      const managers = await client.query(`SELECT COUNT(*)::int AS count FROM portal_internal_user_roles r
        JOIN portal_internal_users e ON e.user_id=r.user_id
        WHERE r.role_key='internal_access_manager' AND e.is_active=TRUE`);
      if (Number(managers.rows[0].count) <= 1) {
        throw adminError('last_access_manager', 'The last active Internal Access Manager cannot be revoked.', 409);
      }
    }
    const changed = input.assigned
      ? await client.query(`INSERT INTO portal_internal_user_roles(user_id,role_key) VALUES($1,$2)
        ON CONFLICT DO NOTHING RETURNING user_id`, [targetId, input.role])
      : await client.query(`DELETE FROM portal_internal_user_roles WHERE user_id=$1 AND role_key=$2
        RETURNING user_id`, [targetId, input.role]);
    const defaultRolePanels = input.role === 'hr' ? INTERNAL_HR_PANEL_IDS
      : input.role === 'project_management' ? INTERNAL_PM_PANEL_IDS : [];
    if (changed.rowCount && input.assigned && defaultRolePanels.length) {
      await client.query(`UPDATE portal_internal_users
        SET panel_access = panel_access || $2::jsonb, updated_at = NOW()
        WHERE user_id = $1 AND NOT panel_access ?| $3::text[]`,
      [targetId, JSON.stringify(defaultRolePanels), defaultRolePanels]);
    }
    if (changed.rowCount) {
      await client.query(`INSERT INTO portal_internal_access_audit(actor_user_id,target_user_id,action)
        VALUES($1,$2,$3)`, [actor.internalUser.user_id, targetId,
        `role.${input.assigned ? 'grant' : 'revoke'}.${input.role}`]);
    }
    await client.query('COMMIT');
  } catch (error) {
    if (client) await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client?.release();
  }
  const internalUsers = await requireInternalUserAdminSchema();
  return internalUsers.find(user => user.id === targetId);
}

export async function updateAdminInternalUser(input, requestHeaders) {
  const actor = await requireInternalUserPermission(requestHeaders, 'internal_users.profile.update');
  assertTerminalOnlyRoleAssignment(input);
  await requireInternalUserAdminSchema();
  const internalUserId = String(input?.id ?? "").trim();
  if (!/^[1-9][0-9]{0,18}$/.test(internalUserId)) {
    throw adminError("invalid_internal_user_identifier", "The selected internal user is invalid.", 400);
  }
  if (internalUserId === String(actor.internalUser.user_id)
    && !actor.profile.roles.includes('internal_admin')) {
    throw adminError('self_management_forbidden', 'You cannot change your own managed account.', 403);
  }
  const settings = internalUserSettings(input);
  const currentUsers = await requireInternalUserAdminSchema();
  const current = currentUsers.find(user => user.id === internalUserId);
  if (!current) throw adminError('internal_user_not_found', 'The selected internal user no longer exists.', 404);
  for (const [changed, permission] of [
    [JSON.stringify(settings.panels) !== JSON.stringify(current.panelAccess), 'internal_users.panel_access.update'],
    [settings.hubstaffUserId !== current.hubstaffUserId, 'internal_users.hubstaff_mapping.update'],
    [settings.active !== current.active, 'internal_users.status.update'],
  ]) {
    if (changed && !hasInternalPermission(actor.profile, permission)) {
      throw adminError('permission_forbidden', 'This internal role does not permit that change.', 403);
    }
  }
  if (settings.hubstaffUserId !== current.hubstaffUserId) {
    await assertActiveHubstaffMember(settings.hubstaffUserId);
  }
  if (!settings.active && current.active) {
    const targetRoles = await getSql()`SELECT role_key FROM portal_internal_user_roles WHERE user_id=${internalUserId}`;
    if (targetRoles.some(row => ['internal_access_manager', 'internal_admin'].includes(row.role_key))) {
      throw adminError('manager_status_owner_controlled', 'Revoke the Internal Admin or Internal Access Manager role through the owner-controlled procedure before disabling this account.', 409);
    }
  }
  const panelsJson = JSON.stringify(settings.panels);
  const sql = getSql();
  let rows;

  try {
    rows = await sql`
      WITH changed_internalUser AS (
        UPDATE portal_internal_users
        SET
          position = ${settings.position},
          panel_access = ${panelsJson}::jsonb,
          encrypted_access_token = CASE
            WHEN hubstaff_user_id IS DISTINCT FROM ${settings.hubstaffUserId}
              OR ${settings.active} = FALSE THEN NULL
            ELSE encrypted_access_token
          END,
          encrypted_refresh_token = CASE
            WHEN hubstaff_user_id IS DISTINCT FROM ${settings.hubstaffUserId}
              OR ${settings.active} = FALSE THEN NULL
            ELSE encrypted_refresh_token
          END,
          access_expires_at = CASE
            WHEN hubstaff_user_id IS DISTINCT FROM ${settings.hubstaffUserId}
              OR ${settings.active} = FALSE THEN NULL
            ELSE access_expires_at
          END,
          last_synced_at = CASE
            WHEN hubstaff_user_id IS DISTINCT FROM ${settings.hubstaffUserId}
              OR ${settings.active} = FALSE THEN NULL
            ELSE last_synced_at
          END,
          next_request_at = CASE
            WHEN hubstaff_user_id IS DISTINCT FROM ${settings.hubstaffUserId}
              OR is_active IS DISTINCT FROM ${settings.active} THEN NULL
            ELSE next_request_at
          END,
          connection_version = connection_version + CASE
            WHEN hubstaff_user_id IS DISTINCT FROM ${settings.hubstaffUserId}
              OR is_active IS DISTINCT FROM ${settings.active} THEN 1
            ELSE 0
          END,
          hubstaff_user_id = ${settings.hubstaffUserId},
          is_active = ${settings.active},
          updated_at = NOW()
        WHERE user_id = ${internalUserId}
        RETURNING user_id
      )
      , audit_row AS (
        INSERT INTO portal_internal_access_audit (actor_user_id, target_user_id, action)
        SELECT ${actor.internalUser.user_id}, user_id, 'internal_user.update' FROM changed_internalUser
        RETURNING id
      )
      UPDATE portal_users AS portal_user
      SET display_name = ${settings.name}
      FROM changed_internalUser
      WHERE portal_user.id = changed_internalUser.user_id
      RETURNING changed_internalUser.user_id
    `;
  } catch (error) {
    if (error?.code === "23505") {
      throw adminError(
        "hubstaff_user_exists",
        "That Hubstaff user ID is already assigned to another internal user.",
        409,
      );
    }
    throw error;
  }

  if (!rows.length) {
    throw adminError("internal_user_not_found", "The selected internal user no longer exists.", 404);
  }
  const internalUsers = await requireInternalUserAdminSchema();
  return internalUsers.find((internalUser) => internalUser.id === internalUserId);
}

export async function createAdminInternalUser(input, requestHeaders) {
  const actor = await requireInternalUserPermission(requestHeaders, 'internal_users.create');
  assertTerminalOnlyRoleAssignment(input);
  await requireInternalUserAdminSchema();
  const username = cleanString(input?.username, 50, "Username", { required: true }).toLowerCase();
  const password = typeof input?.password === "string" ? input.password : "";
  const settings = internalUserSettings(input, { creating: true });

  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    throw adminError(
      "invalid_username",
      "Use 3-50 lowercase letters, numbers, dots, underscores, or hyphens.",
      400,
    );
  }
  const passwordError = passwordValidationMessage(password, username);
  if (passwordError) throw adminError("invalid_password", passwordError, 400);

  const sql = getSql();
  const existingMapping = await sql`
    SELECT 1 FROM portal_internal_users WHERE hubstaff_user_id = ${settings.hubstaffUserId} LIMIT 1
  `;
  if (existingMapping.length) {
    throw adminError(
      "hubstaff_user_exists",
      "That Hubstaff user ID is already assigned to another internal user.",
      409,
    );
  }
  await assertActiveHubstaffMember(settings.hubstaffUserId);

  const provisioningAuth = createPortalAuth({
    allowAccountCreation: true,
    useNextCookies: false,
  });
  const email = `${username}@portal-internal-users.invalid`;
  const panelsJson = JSON.stringify(settings.panels);
  let authUserId = "";

  try {
    const result = await provisioningAuth.api.signUpEmail({
      body: { email, name: settings.name, password, username },
    });
    authUserId = result?.user?.id || "";
    if (!authUserId) throw new Error("The authentication account was not returned.");

    await sql`
      WITH user_row AS (
        INSERT INTO portal_users (external_id, email, display_name)
        VALUES (${authUserId}, ${email}, ${settings.name})
        RETURNING id
      )
      , internal_user_row AS (INSERT INTO portal_internal_users (
        user_id,
        hubstaff_user_id,
        position,
        panel_access
      )
      SELECT
        user_row.id,
        ${settings.hubstaffUserId},
        ${settings.position},
        ${panelsJson}::jsonb
      FROM user_row
      RETURNING user_id)
      INSERT INTO portal_internal_access_audit (actor_user_id, target_user_id, action)
      SELECT ${actor.internalUser.user_id}, user_id, 'internal_user.create' FROM internal_user_row
    `;
  } catch (error) {
    if (authUserId) await sql`DELETE FROM "user" WHERE id = ${authUserId}`.catch(() => null);
    if (error?.publicDetails) throw error;
    if (error?.code === "23505") {
      throw adminError(
        "internal_user_exists",
        "That username or Hubstaff user ID is already assigned.",
        409,
      );
    }
    throw adminError(
      "internal_user_creation_failed",
      error?.status === 422
        ? "That username or email is already in use."
        : "The internal user account could not be created.",
      error?.status === 422 ? 409 : 500,
    );
  }

  const internalUsers = await requireInternalUserAdminSchema();
  return internalUsers.find((internalUser) => internalUser.username === username);
}
