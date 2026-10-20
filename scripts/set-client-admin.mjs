import { databasePool } from "../lib/postgres.js";

const [action, clientSlug, username, ...extra] = process.argv.slice(2);
const valid = value => /^[a-z0-9][a-z0-9._-]{2,49}$/.test(value || "");

try {
  if (!["grant", "revoke"].includes(action) || !valid(clientSlug) || !valid(username) || extra.length) {
    throw new Error("Usage: npm run client:admin -- grant|revoke CLIENT_SLUG USERNAME");
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required.");
  const db = await databasePool.connect();
  try {
    await db.query("BEGIN");
    const client = await db.query("SELECT id FROM portal_clients WHERE slug=$1 FOR UPDATE", [clientSlug]);
    if (!client.rowCount) throw new Error("That client workspace does not exist.");
    const clientId = client.rows[0].id;
    const target = await db.query(`SELECT m.user_id,m.role,m.is_active FROM portal_memberships m
      JOIN portal_users p ON p.id=m.user_id JOIN "user" u ON u.id=p.external_id
      WHERE m.client_id=$1 AND LOWER(u.username)=$2 FOR UPDATE OF m`, [clientId, username]);
    if (!target.rowCount) throw new Error("That account has no membership in this client workspace.");
    const member = target.rows[0];
    if (!member.is_active) throw new Error("Activate the membership before changing its administrator role.");
    const internalTable = await db.query("SELECT to_regclass('public.portal_internal_users') IS NOT NULL AS present");
    if (internalTable.rows[0].present) {
      const internal = await db.query("SELECT 1 FROM portal_internal_users WHERE user_id=$1", [member.user_id]);
      if (internal.rowCount) throw new Error("Internal users cannot receive client administrator access.");
    }
    if (!["client_viewer", "member", "client_admin"].includes(member.role)) {
      throw new Error("This legacy membership role requires separate review.");
    }
    if (action === "grant" && member.role === "client_admin") {
      console.log("The account already has Client Administrator access.");
    } else if (action === "revoke" && member.role !== "client_admin") {
      console.log("The account is not a Client Administrator.");
    } else {
      if (action === "revoke") {
        const count = await db.query(`SELECT COUNT(*)::int AS total FROM portal_memberships
          WHERE client_id=$1 AND role='client_admin' AND is_active=TRUE`, [clientId]);
        if (count.rows[0].total <= 1) throw new Error("The last active Client Administrator cannot be revoked.");
      }
      const nextRole = action === "grant" ? "client_admin" : "member";
      await db.query(`UPDATE portal_memberships SET role=$3,updated_at=NOW()
        WHERE client_id=$1 AND user_id=$2`, [clientId, member.user_id, nextRole]);
      await db.query(`INSERT INTO portal_client_access_audit
        (client_id,target_user_id,action,source,previous_role,next_role)
        VALUES($1,$2,$3,'terminal',$4,$5)`, [clientId, member.user_id,
        action === "grant" ? "admin_grant" : "admin_revoke", member.role, nextRole]);
    }
    await db.query("COMMIT");
    if ((action === "grant" && member.role !== "client_admin")
      || (action === "revoke" && member.role === "client_admin")) {
      console.log(`Client Administrator ${action} completed for ${username} in ${clientSlug}.`);
    }
  } catch (error) {
    await db.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { db.release(); }
} catch (error) {
  const safe = String(error?.message || "Client administrator role change failed.")
    .replaceAll(process.env.DATABASE_URL || " ", "[database URL removed]").slice(0, 300);
  console.error(safe);
  process.exitCode = 1;
} finally {
  await databasePool.end().catch(() => {});
}
