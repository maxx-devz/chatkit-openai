import { neon } from "@neondatabase/serverless";

function fail(message) {
  console.error(`\nCould not list clients: ${message}`);
  process.exitCode = 1;
}

async function main() {
  if (!process.env.DATABASE_URL?.trim()) {
    fail("DATABASE_URL must be set in .env.local.");
    return;
  }

  const sql = neon(process.env.DATABASE_URL);
  const rows = await sql`
    SELECT
      client.display_name,
      client.slug,
      client.portal_enabled,
      client.ai_enabled,
      COALESCE(
        STRING_AGG(DISTINCT auth_user.username, ', ' ORDER BY auth_user.username),
        ''
      ) AS usernames
    FROM portal_clients AS client
    LEFT JOIN portal_memberships AS membership
      ON membership.client_id = client.id
    LEFT JOIN portal_users AS portal_user
      ON portal_user.id = membership.user_id
    LEFT JOIN "user" AS auth_user
      ON auth_user.id = portal_user.external_id
    GROUP BY
      client.id,
      client.display_name,
      client.slug,
      client.portal_enabled,
      client.ai_enabled
    ORDER BY client.display_name ASC;
  `;

  if (!rows.length) {
    console.log("No clients found.");
    return;
  }

  console.table(rows.map((row) => ({
    "Client name": row.display_name,
    Username: row.usernames || row.slug,
    "Portal": row.portal_enabled ? "Enabled" : "Disabled",
    "AI assistant": row.ai_enabled ? "Enabled" : "Disabled",
  })));
}

try {
  await main();
} catch (error) {
  fail(error?.message || "An unexpected database error occurred.");
}
