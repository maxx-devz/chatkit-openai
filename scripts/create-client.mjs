import { Writable } from "node:stream";
import { createInterface } from "node:readline/promises";

import { neon } from "@neondatabase/serverless";

import {
  closeAuthDatabase,
  createPortalAuth,
  isPortalAuthConfigured,
} from "../lib/auth.js";

function fail(message) {
  console.error(`\nAccount was not created: ${message}`);
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
      "Run this command in an interactive terminal or set AOC_CLIENT_PASSWORD temporarily.",
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
  const displayName = String(process.argv.slice(3).join(" ") || defaultDisplayName(username)).trim();

  if (!/^[a-z0-9][a-z0-9._-]{2,49}$/.test(username)) {
    fail("Use a 3-50 character username containing letters, numbers, dots, underscores, or hyphens.");
    return;
  }

  if (!displayName || displayName.length > 120) {
    fail("The display name must contain 1-120 characters.");
    return;
  }

  const password = process.env.AOC_CLIENT_PASSWORD
    || await hiddenQuestion(`Password for ${username}: `);
  const confirmation = process.env.AOC_CLIENT_PASSWORD
    || await hiddenQuestion("Confirm password: ");

  if (password !== confirmation) {
    fail("The passwords did not match.");
    return;
  }

  if (password.length < 8 || password.length > 128) {
    fail("The password must contain 8-128 characters.");
    return;
  }

  if (password.toLowerCase() === `${username}123`) {
    console.warn("\nWarning: this predictable password is suitable only for local testing. Change it before inviting a real client.");
  }

  const sql = neon(process.env.DATABASE_URL);
  const schema = await sql`
    SELECT
      to_regclass('public.portal_clients') IS NOT NULL AS has_clients,
      to_regclass('public.portal_users') IS NOT NULL AS has_users,
      to_regclass('public.portal_memberships') IS NOT NULL AS has_memberships
  `;

  if (!schema[0]?.has_clients || !schema[0]?.has_users || !schema[0]?.has_memberships) {
    fail("The portal schema is missing. Run database/schema.sql in the Neon SQL Editor first.");
    return;
  }

  const provisioningAuth = createPortalAuth({
    allowAccountCreation: true,
    useNextCookies: false,
  });
  const email = `${username}@portal-users.invalid`;
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
    WITH client_row AS (
      INSERT INTO portal_clients (slug, display_name)
      VALUES (${username}, ${displayName})
      ON CONFLICT (slug) DO UPDATE
        SET display_name = EXCLUDED.display_name,
            updated_at = NOW()
      RETURNING id
    ),
    user_row AS (
      INSERT INTO portal_users (external_id, email, display_name)
      VALUES (${result.user.id}, ${email}, ${displayName})
      ON CONFLICT (external_id) DO UPDATE
        SET email = EXCLUDED.email,
            display_name = EXCLUDED.display_name,
            updated_at = NOW()
      RETURNING id
    )
    INSERT INTO portal_memberships (client_id, user_id, role)
    SELECT client_row.id, user_row.id, 'client_admin'
    FROM client_row, user_row
    ON CONFLICT (client_id, user_id) DO UPDATE
      SET role = EXCLUDED.role,
          updated_at = NOW()
  `;

  console.log(`\nCreated ${displayName}`);
  console.log(`Username: ${username}`);
  console.log("Access: one private client workspace");
  console.log("Password: securely hashed by Better Auth (not shown or stored in portal tables)");
}

try {
  await main();
} catch (error) {
  fail(error?.message || "An unexpected provisioning error occurred.");
} finally {
  await closeAuthDatabase().catch(() => null);
}
