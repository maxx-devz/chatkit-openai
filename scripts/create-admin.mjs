import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";

import { neon } from "@neondatabase/serverless";

import {
  closeAuthDatabase,
  createPortalAuth,
  isPortalAuthConfigured,
} from "../lib/auth.js";

function fail(message) {
  console.error(`\nAdministrator was not created: ${message}`);
  process.exitCode = 1;
}

function normalizedUsername(value) {
  return String(value || "").trim().toLowerCase();
}

function defaultDisplayName(username) {
  return username
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

async function hiddenQuestion(prompt) {
  if (!process.stdin.isTTY) {
    throw new Error(
      "Run this command in an interactive terminal or set AOC_ADMIN_PASSWORD temporarily.",
    );
  }

  let muted = false;
  const output = new Writable({
    write(chunk, encoding, callback) {
      if (!muted) process.stdout.write(chunk, encoding);
      callback();
    },
  });
  const reader = createInterface({ input: process.stdin, output, terminal: true });

  process.stdout.write(prompt);
  muted = true;
  const answer = await reader.question("");
  muted = false;
  process.stdout.write("\n");
  reader.close();
  return answer;
}

async function main() {
  if (!isPortalAuthConfigured()) {
    fail("DATABASE_URL, BETTER_AUTH_SECRET, and BETTER_AUTH_URL must be set in .env.local.");
    return;
  }

  const username = normalizedUsername(process.argv[2]);
  const displayName = String(
    process.argv.slice(3).join(" ") || defaultDisplayName(username),
  ).trim();

  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    fail("Use a 3-50 character username containing letters, numbers, dots, underscores, or hyphens.");
    return;
  }

  if (!displayName || displayName.length > 120) {
    fail("The display name must contain 1-120 characters.");
    return;
  }

  const password = process.env.AOC_ADMIN_PASSWORD
    || await hiddenQuestion(`Password for ${username}: `);
  const confirmation = process.env.AOC_ADMIN_PASSWORD
    || await hiddenQuestion("Confirm password: ");

  if (password !== confirmation) {
    fail("The passwords did not match.");
    return;
  }

  if (password.length < 12 || password.length > 128) {
    fail("An administrator password must contain 12-128 characters.");
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  const schema = await sql`
    SELECT
      to_regclass('public.portal_users') IS NOT NULL AS has_users,
      to_regclass('public.portal_admins') IS NOT NULL AS has_admins
  `;

  if (!schema[0]?.has_users || !schema[0]?.has_admins) {
    fail("The admin schema is missing. Run database/admin-schema.sql in the Neon SQL Editor first.");
    return;
  }

  const provisioningAuth = createPortalAuth({
    allowAccountCreation: true,
    useNextCookies: false,
  });
  const email = `${username}@portal-admins.invalid`;
  const result = await provisioningAuth.api.signUpEmail({
    body: {
      email,
      name: displayName,
      password,
      username,
    },
  });

  if (!result?.user?.id) {
    throw new Error("The authentication account was not returned.");
  }

  await sql`
    WITH user_row AS (
      INSERT INTO portal_users (external_id, email, display_name)
      VALUES (${result.user.id}, ${email}, ${displayName})
      ON CONFLICT (external_id) DO UPDATE
        SET email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            updated_at = NOW()
      RETURNING id
    )
    INSERT INTO portal_admins (user_id, role, is_active)
    SELECT user_row.id, 'aoc_admin', TRUE
    FROM user_row
    ON CONFLICT (user_id) DO UPDATE
      SET role = EXCLUDED.role,
          is_active = TRUE,
          updated_at = NOW()
  `;

  console.log(`\nCreated ${displayName}`);
  console.log(`Username: ${username}`);
  console.log("Role: aoc_admin");
  console.log("Password: securely hashed by Better Auth (never stored in portal_admins)");
  console.log("Status: ready for a future server-protected /admin portal");
}

try {
  await main();
} catch (error) {
  fail(error?.message || "An unexpected provisioning error occurred.");
} finally {
  await closeAuthDatabase().catch(() => null);
}
