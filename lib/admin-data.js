import "server-only";

import { neon } from "@neondatabase/serverless";

import { auth, createPortalAuth, isPortalAuthConfigured } from "@/lib/auth";
import { assertNotEmployee } from "@/lib/employee-access";
import {
  hasUnsafeMultilineText,
  hasUnsafePlainText,
  passwordValidationMessage,
} from "@/lib/input-validation";
import { normalizeHubstaffProjectUrl } from "@/lib/hubstaff";
import { normalizeApprovedWebsiteUrl } from "@/lib/client-website";
import {
  employeePanelAccess,
  employeePosition,
  isEmployeePosition,
} from "@/lib/employee-positions";

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

function employeeRecord(row) {
  const position = employeePosition(row.position);
  return {
    id: String(row.user_id),
    username: row.username || "",
    name: row.display_name,
    email: row.email || "",
    position: position.id,
    positionLabel: position.label,
    panelAccess: employeePanelAccess(row.panel_access, position.id),
    active: row.is_active === true,
    hubstaffUserId: String(row.hubstaff_user_id),
    connected: row.connected === true,
    lastSyncedAt: row.last_synced_at || "",
    createdAt: row.created_at || "",
  };
}

async function queryAdminEmployees() {
  const sql = getSql();
  const relation = await sql`SELECT to_regclass('portal_employees') AS relation`;
  if (!relation[0]?.relation) return { employees: [], schemaReady: false };

  try {
    const rows = await sql`
      SELECT
        employee.user_id,
        employee.hubstaff_user_id,
        employee.position,
        employee.panel_access,
        employee.is_active,
        employee.encrypted_access_token IS NOT NULL AS connected,
        employee.last_synced_at,
        employee.created_at,
        portal_user.display_name,
        portal_user.email,
        auth_user.username
      FROM portal_employees AS employee
      JOIN portal_users AS portal_user
        ON portal_user.id = employee.user_id
      LEFT JOIN "user" AS auth_user
        ON auth_user.id = portal_user.external_id
      ORDER BY portal_user.display_name ASC
    `;
    return { employees: rows.map(employeeRecord), schemaReady: true };
  } catch (error) {
    if (error?.code === "42703") return { employees: [], schemaReady: false };
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

  await assertNotEmployee(session.user.id);
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
  const [clients, employeeData] = await Promise.all([
    queryAdminClients(),
    queryAdminEmployees(),
  ]);

  return {
    admin: context.admin,
    clients,
    employees: employeeData.employees,
    employeeSchemaReady: employeeData.schemaReady,
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
      totalEmployees: employeeData.employees.length,
      activeEmployees: employeeData.employees.filter((employee) => employee.active).length,
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

function employeeSettings(input, { creating = false } = {}) {
  const name = cleanString(input?.name, 120, "Employee name", { required: true });
  const position = cleanString(input?.position, 60, "Employee position", { required: true });
  if (!isEmployeePosition(position)) {
    throw adminError(
      "invalid_employee_position",
      "Select a supported employee position.",
      400,
    );
  }

  const rawPanels = input?.panelAccess === undefined && creating
    ? employeePosition(position).panels
    : input?.panelAccess;
  if (!Array.isArray(rawPanels)) {
    throw adminError("invalid_employee_panels", "Select at least one employee portal panel.", 400);
  }
  const panels = employeePanelAccess(rawPanels, position);
  if (
    panels.length === 0
    || panels.length !== rawPanels.length
    || new Set(rawPanels).size !== rawPanels.length
  ) {
    throw adminError(
      "invalid_employee_panels",
      "Employee panel access contains an unsupported or duplicate selection.",
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
    throw adminError("invalid_employee_status", "Employee portal status must be enabled or disabled.", 400);
  }

  return { name, position, panels, hubstaffUserId, active };
}

async function requireEmployeeAdminSchema() {
  const result = await queryAdminEmployees();
  if (!result.schemaReady) {
    throw adminError(
      "employee_schema_required",
      "Employee Controls need the latest employee migration. Run npm run employee:migrate.",
      503,
    );
  }
  return result.employees;
}

export async function loadAdminEmployees(requestHeaders) {
  await resolveAdminContext(requestHeaders);
  const result = await queryAdminEmployees();
  return {
    employees: result.employees,
    schemaReady: result.schemaReady,
  };
}

export async function updateAdminEmployee(input, requestHeaders) {
  await resolveAdminContext(requestHeaders);
  await requireEmployeeAdminSchema();
  const employeeId = String(input?.id ?? "").trim();
  if (!/^[1-9][0-9]{0,18}$/.test(employeeId)) {
    throw adminError("invalid_employee_identifier", "The selected employee is invalid.", 400);
  }
  const settings = employeeSettings(input);
  const panelsJson = JSON.stringify(settings.panels);
  const sql = getSql();
  let rows;

  try {
    rows = await sql`
      WITH changed_employee AS (
        UPDATE portal_employees
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
        WHERE user_id = ${employeeId}
        RETURNING user_id
      )
      UPDATE portal_users AS portal_user
      SET display_name = ${settings.name}
      FROM changed_employee
      WHERE portal_user.id = changed_employee.user_id
      RETURNING changed_employee.user_id
    `;
  } catch (error) {
    if (error?.code === "23505") {
      throw adminError(
        "hubstaff_user_exists",
        "That Hubstaff user ID is already assigned to another employee.",
        409,
      );
    }
    throw error;
  }

  if (!rows.length) {
    throw adminError("employee_not_found", "The selected employee no longer exists.", 404);
  }
  const employees = await requireEmployeeAdminSchema();
  return employees.find((employee) => employee.id === employeeId);
}

export async function createAdminEmployee(input, requestHeaders) {
  await resolveAdminContext(requestHeaders);
  await requireEmployeeAdminSchema();
  const username = cleanString(input?.username, 50, "Username", { required: true }).toLowerCase();
  const password = typeof input?.password === "string" ? input.password : "";
  const settings = employeeSettings(input, { creating: true });

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
    SELECT 1 FROM portal_employees WHERE hubstaff_user_id = ${settings.hubstaffUserId} LIMIT 1
  `;
  if (existingMapping.length) {
    throw adminError(
      "hubstaff_user_exists",
      "That Hubstaff user ID is already assigned to another employee.",
      409,
    );
  }

  const provisioningAuth = createPortalAuth({
    allowAccountCreation: true,
    useNextCookies: false,
  });
  const email = `${username}@portal-employees.invalid`;
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
      INSERT INTO portal_employees (
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
    `;
  } catch (error) {
    if (authUserId) await sql`DELETE FROM "user" WHERE id = ${authUserId}`.catch(() => null);
    if (error?.publicDetails) throw error;
    if (error?.code === "23505") {
      throw adminError(
        "employee_exists",
        "That username or Hubstaff user ID is already assigned.",
        409,
      );
    }
    throw adminError(
      "employee_creation_failed",
      error?.status === 422
        ? "That username or email is already in use."
        : "The employee account could not be created.",
      error?.status === 422 ? 409 : 500,
    );
  }

  const employees = await requireEmployeeAdminSchema();
  return employees.find((employee) => employee.username === username);
}
