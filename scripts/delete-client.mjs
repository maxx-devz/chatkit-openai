import { createInterface } from "node:readline/promises";

import pg from "pg";

const { Pool } = pg;
const PROTECTED_USERNAMES = new Set(["aocadmin"]);

function fail(message) {
  console.error(`\nClient was not deleted: ${message}`);
  process.exitCode = 1;
}

function normalizedUsername(value) {
  return String(value || "").trim().toLowerCase();
}

async function confirmDeletion(username) {
  if (!process.stdin.isTTY) {
    throw new Error("Run this destructive command in an interactive terminal.");
  }

  const reader = createInterface({ input: process.stdin, output: process.stdout });
  const expected = `DELETE ${username}`;
  const answer = await reader.question(`Type ${expected} to confirm: `);
  reader.close();
  return answer === expected;
}

async function main() {
  const username = normalizedUsername(process.argv[2]);
  const hasDeleteFlag = process.argv.includes("--confirm-delete");

  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL must be set in .env.local.");
    return;
  }

  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    fail("Provide the exact 3-50 character client username to delete.");
    return;
  }

  if (PROTECTED_USERNAMES.has(username)) {
    fail(`${username} is a protected administrator username.`);
    return;
  }

  if (!hasDeleteFlag) {
    fail(`Add --confirm-delete after reviewing the target: ${username}`);
    return;
  }

  const confirmed = await confirmDeletion(username);
  if (!confirmed) {
    fail("The typed confirmation did not match. Nothing was changed.");
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 8_000,
  });
  const database = await pool.connect();

  try {
    await database.query("BEGIN");

    const adminSchemaResult = await database.query(
      "SELECT to_regclass('public.portal_admins') IS NOT NULL AS exists",
    );
    const hasAdminTable = adminSchemaResult.rows[0]?.exists === true;

    const clientResult = await database.query(
      `SELECT id, slug, display_name
       FROM portal_clients
       WHERE slug = $1
       FOR UPDATE`,
      [username],
    );
    const authResult = await database.query(
      `SELECT id, username, name, email
       FROM "user"
       WHERE LOWER(username) = $1
       FOR UPDATE`,
      [username],
    );

    if (!clientResult.rowCount && !authResult.rowCount) {
      throw new Error(`No client or login named ${username} was found.`);
    }

    const clientId = clientResult.rows[0]?.id;
    let linkedUsers = [];

    if (clientId) {
      const adminProtection = hasAdminTable
        ? `EXISTS (
             SELECT 1
             FROM portal_admins AS administrator
             WHERE administrator.user_id = portal_user.id
               AND administrator.is_active = TRUE
           )`
        : "FALSE";
      const linkedResult = await database.query(
        `SELECT DISTINCT
           portal_user.id,
           portal_user.external_id,
           EXISTS (
             SELECT 1
             FROM portal_memberships AS other_membership
             WHERE other_membership.user_id = portal_user.id
               AND other_membership.client_id <> $1
           ) AS has_other_memberships,
           ${adminProtection} AS is_active_admin
         FROM portal_memberships AS membership
         JOIN portal_users AS portal_user
           ON portal_user.id = membership.user_id
         WHERE membership.client_id = $1`,
        [clientId],
      );
      linkedUsers = linkedResult.rows;

      await database.query(
        "DELETE FROM portal_clients WHERE id = $1",
        [clientId],
      );
    }

    const deletedAuthIds = new Set();

    for (const linkedUser of linkedUsers) {
      if (linkedUser.has_other_memberships || linkedUser.is_active_admin) continue;

      await database.query(
        "DELETE FROM portal_users WHERE id = $1",
        [linkedUser.id],
      );
      await database.query(
        `DELETE FROM "user" WHERE id = $1`,
        [linkedUser.external_id],
      );
      deletedAuthIds.add(linkedUser.external_id);
    }

    const targetAuthUser = authResult.rows[0];
    const targetLink = linkedUsers.find(
      (linkedUser) => linkedUser.external_id === targetAuthUser?.id,
    );
    const targetMustRemain = targetLink?.has_other_memberships
      || targetLink?.is_active_admin;

    if (targetAuthUser && !deletedAuthIds.has(targetAuthUser.id) && !targetMustRemain) {
      const adminResult = hasAdminTable
        ? await database.query(
          `SELECT 1
           FROM portal_admins AS administrator
           JOIN portal_users AS portal_user
             ON portal_user.id = administrator.user_id
           WHERE portal_user.external_id = $1
             AND administrator.is_active = TRUE
           LIMIT 1`,
          [targetAuthUser.id],
        )
        : { rowCount: 0 };

      if (adminResult.rowCount) {
        throw new Error("The target login is an active AOC administrator and was not deleted.");
      }

      await database.query(
        "DELETE FROM portal_users WHERE external_id = $1",
        [targetAuthUser.id],
      );
      await database.query(
        `DELETE FROM "user" WHERE id = $1`,
        [targetAuthUser.id],
      );
    }

    await database.query("COMMIT");
    console.log(`\nDeleted client: ${username}`);
    console.log("Removed: client data, memberships, saved workspaces, knowledge, and exclusive logins");
    console.log("Protected: active AOC administrator accounts and users assigned to other clients");
  } catch (error) {
    await database.query("ROLLBACK").catch(() => null);
    throw error;
  } finally {
    database.release();
    await pool.end();
  }
}

try {
  await main();
} catch (error) {
  fail(error?.message || "An unexpected deletion error occurred.");
}
