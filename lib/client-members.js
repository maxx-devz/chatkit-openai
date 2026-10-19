import "server-only";

import { createPortalAuth } from "@/lib/auth";
import { isOrdinaryClientRole } from "@/lib/client-permissions";
import { databasePool } from "@/lib/database";
import { hasUnsafePlainText, isValidUsername, normalizeUsername, passwordValidationMessage } from "@/lib/input-validation";
import { requireClientPermission } from "@/lib/portal-data";

function accessError(code, message, status = 400) {
  return Object.assign(new Error(message), { publicDetails: { code, message, status } });
}

function memberId(value) {
  const id = String(value || "");
  if (!/^[1-9][0-9]{0,18}$/.test(id) || BigInt(id) > 9_223_372_036_854_775_807n) {
    throw accessError("invalid_member", "Select a valid client member.");
  }
  return id;
}

async function lockActiveAdministrator(db, context) {
  const { rows } = await db.query(`SELECT role,is_active FROM portal_memberships
    WHERE client_id=$1 AND user_id=$2 FOR UPDATE`, [context.client.id, context.user.id]);
  if (rows[0]?.role !== "client_admin" || !rows[0]?.is_active) {
    throw accessError("client_permission_denied", "Client Administrator access is required.", 403);
  }
}

export async function listClientMembers(requestHeaders) {
  const context = await requireClientPermission(requestHeaders, "client.members.manage");
  const { rows } = await databasePool.query(`SELECT m.user_id::text AS id,
    COALESCE(p.display_name,u.name,u.username) AS name,u.username,m.role,m.is_active
    FROM portal_memberships m
    JOIN portal_users p ON p.id=m.user_id
    JOIN "user" u ON u.id=p.external_id
    WHERE m.client_id=$1 ORDER BY m.is_active DESC,LOWER(COALESCE(p.display_name,u.name,u.username)),m.user_id`,
  [context.client.id]);
  return { members: rows.map(row => ({ id: row.id, name: row.name, username: row.username,
    role: row.role, active: row.is_active })) };
}

export async function listClientAccessAudit(requestHeaders, before = "") {
  const context = await requireClientPermission(requestHeaders, "client.access_audit.read");
  const cursor = before ? memberId(before) : null;
  const { rows } = await databasePool.query(`SELECT a.id::text,a.action,a.source,a.previous_role,a.next_role,a.occurred_at,
    COALESCE(actor.display_name,CASE WHEN a.source='terminal' THEN 'AOC terminal' ELSE 'AOC' END) AS actor_name,
    COALESCE(target.display_name,'Former user') AS target_name
    FROM portal_client_access_audit a
    LEFT JOIN portal_users actor ON actor.id=a.actor_user_id
    LEFT JOIN portal_users target ON target.id=a.target_user_id
    WHERE a.client_id=$1 AND ($2::bigint IS NULL OR a.id<$2::bigint)
    ORDER BY a.id DESC LIMIT 21`, [context.client.id, cursor]);
  return { events: rows.slice(0, 20).map(row => ({ id: row.id, action: row.action,
    previousRole: row.previous_role, nextRole: row.next_role, occurredAt: row.occurred_at,
    actorName: row.actor_name, targetName: row.target_name })),
  nextCursor: rows.length > 20 ? rows[19].id : null };
}

export async function createClientMember(requestHeaders, input) {
  const context = await requireClientPermission(requestHeaders, "client.members.manage");
  const username = normalizeUsername(input?.username);
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  const role = input?.role;
  const password = input?.password;
  if (!isValidUsername(username) || !name || name.length > 120 || hasUnsafePlainText(name)
    || !isOrdinaryClientRole(role)) {
    throw accessError("invalid_member", "Enter a valid name, username, and Viewer or Member role.");
  }
  const passwordError = passwordValidationMessage(password, username);
  if (passwordError) throw accessError("invalid_password", passwordError);

  // Confirm the migration and actor before creating a Better Auth account.
  await databasePool.query("SELECT id FROM portal_client_access_audit LIMIT 0");
  let authUserId = "";
  try {
    const provisioning = createPortalAuth({ allowAccountCreation: true, useNextCookies: false });
    const result = await provisioning.api.signUpEmail({ body: {
      username, name, password, email: `${username}@portal-users.invalid`,
    } });
    authUserId = result?.user?.id || "";
    if (!authUserId) throw accessError("account_creation_failed", "The login could not be created.", 503);

    const db = await databasePool.connect();
    try {
      await db.query("BEGIN");
      await lockActiveAdministrator(db, context);
      const user = await db.query(`INSERT INTO portal_users(external_id,email,display_name)
        VALUES($1,$2,$3) RETURNING id`, [authUserId, `${username}@portal-users.invalid`, name]);
      const userId = user.rows[0].id;
      await db.query(`INSERT INTO portal_memberships(client_id,user_id,role,is_active)
        VALUES($1,$2,$3,TRUE)`, [context.client.id, userId, role]);
      await db.query(`INSERT INTO portal_client_access_audit
        (client_id,actor_user_id,target_user_id,action,next_role)
        VALUES($1,$2,$3,'create',$4)`, [context.client.id, context.user.id, userId, role]);
      await db.query("COMMIT");
      return { id: String(userId), name, username, role, active: true };
    } catch (error) {
      await db.query("ROLLBACK").catch(() => {});
      throw error;
    } finally { db.release(); }
  } catch (error) {
    if (authUserId) await databasePool.query('DELETE FROM "user" WHERE id=$1', [authUserId])
      .catch(() => console.error("Client account cleanup failed after membership creation error."));
    if (error?.publicDetails) throw error;
    if (error?.status === 422 || error?.code === "23505") {
      throw accessError("username_unavailable", "That username is already in use.", 409);
    }
    throw accessError("account_creation_failed", "The client login could not be created.", 503);
  }
}

export async function updateClientMember(requestHeaders, input) {
  const context = await requireClientPermission(requestHeaders, "client.members.manage");
  const targetId = memberId(input?.id);
  const action = input?.action;
  if (targetId === context.user.id) {
    throw accessError("self_management_forbidden", "You cannot change your own client access.", 403);
  }
  if (!["role_change", "deactivate", "reactivate"].includes(action)
    || (action === "role_change" && !isOrdinaryClientRole(input?.role))) {
    throw accessError("invalid_change", "Select a supported client access change.");
  }
  const db = await databasePool.connect();
  try {
    await db.query("BEGIN");
    await lockActiveAdministrator(db, context);
    const { rows } = await db.query(`SELECT role,is_active FROM portal_memberships
      WHERE client_id=$1 AND user_id=$2 FOR UPDATE`, [context.client.id, targetId]);
    const current = rows[0];
    if (!current) throw accessError("member_not_found", "This person is not a member of this client.", 404);
    if (!isOrdinaryClientRole(current.role)) {
      throw accessError("protected_role", "Only AOC can change a Client Administrator.", 403);
    }
    if (action === "role_change" && !current.is_active) {
      throw accessError("inactive_member", "Reactivate this member before changing their role.", 409);
    }
    const nextRole = action === "role_change" ? input.role : current.role;
    const nextActive = action === "deactivate" ? false : action === "reactivate" ? true : current.is_active;
    if (nextRole !== current.role || nextActive !== current.is_active) {
      await db.query(`UPDATE portal_memberships SET role=$3,is_active=$4,updated_at=NOW()
        WHERE client_id=$1 AND user_id=$2`, [context.client.id, targetId, nextRole, nextActive]);
      await db.query(`INSERT INTO portal_client_access_audit
        (client_id,actor_user_id,target_user_id,action,previous_role,next_role)
        VALUES($1,$2,$3,$4,$5,$6)`, [context.client.id, context.user.id, targetId,
        action, current.role, nextRole]);
    }
    await db.query("COMMIT");
    return { id: targetId, role: nextRole, active: nextActive };
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    if (error?.publicDetails) throw error;
    throw accessError("member_update_failed", "Client access could not be updated.", 503);
  } finally { db.release(); }
}
