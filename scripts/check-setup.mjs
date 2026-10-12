// Read-only checks: no model calls, account changes, or secret values in output.
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import nextEnv from "@next/env";
import pg from "pg";
import { chatKitBackendUrl } from "../lib/chatkit-security.js";
import { normalizeReportTimeZone } from "../lib/hubstaff-data.js";

const production = process.argv.includes("--production");
const root = fileURLToPath(new URL("../", import.meta.url));
// Production checks use explicitly supplied environment variables, never local credentials.
if (!production) nextEnv.loadEnvConfig(root, true);
let failures = 0;
function check(ok, label, help) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}${ok ? "" : `: ${help}`}`);
  if (!ok) failures++;
}
function configured(name) {
  const value = process.env[name]?.trim() || "";
  return value && !/your[-_ ]|example|replace[-_ ]|placeholder/i.test(value);
}
check(Number(process.versions.node.split(".")[0]) >= 22, "Node.js 22+", "Update Node.js and reopen your terminal.");
for (const name of ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL", "NEXT_PUBLIC_CHATKIT_DOMAIN_KEY"]) {
  check(Boolean(configured(name)), name, "Set this in .env.local / the Vercel frontend environment settings.");
}
check((process.env.PROVIDER_SETTINGS_SECRET?.length || 0) >= 32, "Provider encryption secret",
  "Set the same stable PROVIDER_SETTINGS_SECRET (32+ chars) on both services; manage API keys in AOC Admin.");
check((process.env.BETTER_AUTH_SECRET?.length || 0) >= 32, "Authentication secret length", "Use at least 32 characters; preserve the existing production secret.");
let origin;
try {
  origin = new URL(process.env.BETTER_AUTH_URL);
  check(origin.origin === process.env.BETTER_AUTH_URL && !origin.username && !origin.password
    && (production ? origin.protocol === "https:" : origin.origin === "http://127.0.0.1:3000"),
  "Portal origin", production ? "Use the exact production HTTPS origin without a trailing slash." : "Use http://127.0.0.1:3000 for npm run dev.");
} catch { check(false, "Portal origin", "BETTER_AUTH_URL must be a valid origin."); }
let backend;
try {
  backend = chatKitBackendUrl(process.env.CHATKIT_BACKEND_URL || "http://127.0.0.1:8000", production);
  check(true, "ChatKit backend origin");
} catch { check(false, "ChatKit backend origin", "Set the Python project's HTTPS origin, without /chatkit."); }
const localBackend = backend && ["127.0.0.1", "localhost", "[::1]"].includes(backend.hostname);
const secret = process.env.CHATKIT_BACKEND_SECRET || "";
check(secret.length >= 32 || (!production && localBackend && !secret.trim()), "Backend shared secret",
  "Use the same random secret of at least 32 characters on both Vercel projects.");
if (!production && localBackend) {
  check(existsSync(new URL(process.platform === "win32" ? "../.venv/Scripts/python.exe" : "../.venv/bin/python", import.meta.url)),
    "Python environment", "Create .venv and install chatkit_backend/requirements.txt.");
}
const retiredImages = new Set(["gpt-image-1", "gpt-image-1-mini", "gpt-image-1.5", "chatgpt-image-latest", "dall-e-2", "dall-e-3"]);
check(!retiredImages.has(process.env.OPENAI_IMAGE_MODEL?.trim()), "Image model configuration",
  "The configured image model has a retirement notice. Use OPENAI_IMAGE_MODEL=gpt-image-2 before enabling images.");
const hubstaffTimeZone = process.env.HUBSTAFF_REPORT_TIME_ZONE?.trim();
check(!hubstaffTimeZone || normalizeReportTimeZone(hubstaffTimeZone) === hubstaffTimeZone,
  "Hubstaff reporting timezone", "Use a valid IANA timezone such as Asia/Manila.");
const hubstaffPatConfigured = Boolean(configured("HUBSTAFF_PAT_REFRESH_TOKEN"));
const checkInternalUsers = process.argv.includes("--internal-user") || process.argv.includes("--employee");
if (hubstaffPatConfigured || checkInternalUsers) {
  check((process.env.HUBSTAFF_TOKEN_ENCRYPTION_KEY?.trim().length || 0) >= 32,
    "Hubstaff PAT encryption key",
    "Set HUBSTAFF_TOKEN_ENCRYPTION_KEY to a stable random value containing at least 32 characters.");
}

if (configured("DATABASE_URL")) {
  const db = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 8000, query_timeout: 10000 });
  try {
    await db.connect();
    const groups = {
      "auth:migrate": ["user", "session", "account", "verification", "rateLimit"],
      "portal:migrate": ["portal_clients", "portal_memberships", "portal_workspace_snapshots"],
      "admin:migrate": ["portal_admins", "portal_ai_usage_monthly", "portal_hubstaff_tokens"],
      "chatkit:migrate": ["portal_chatkit_threads", "portal_chatkit_items", "portal_chatkit_leases"],
      ...((process.env.CHATKIT_UPLOADS_ENABLED || "true").toLowerCase() === "true" ? {
      "uploads:migrate": ["portal_chatkit_uploads", "portal_chatkit_upload_attempts"],
      } : {}),
      "library:migrate": ["portal_client_library"],
      "usage:migrate": ["portal_ai_activity_monthly", "portal_ai_provider_status"],
      "site-ai:migrate": ["portal_site_ai_settings", "portal_ai_credentials", "portal_ai_active_provider"],
      "builder:migrate": ["portal_assistant_configs", "portal_assistant_versions", "portal_assistant_files", "portal_assistant_tool_usage", "portal_assistant_preview_usage"],
      ...(checkInternalUsers ? { "internal-user:migrate": ["portal_internal_users"] } : {}),
    };
    for (const [migration, tables] of Object.entries(groups)) {
      const result = await db.query("SELECT name, to_regclass('public.' || quote_ident(name)) IS NOT NULL AS present FROM unnest($1::text[]) AS name", [tables]);
      check(result.rows.every(row => row.present), migration + " tables", `Run npm run ${migration} against this deployment's database.`);
    }
    const integrationColumns = await db.query(
      "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='portal_clients' AND column_name = ANY($1::text[])",
      [["hubstaff_monthly_hours_limit", "hubstaff_tracking_project_id", "approved_website_url"]],
    );
    check(integrationColumns.rows.length === 3, "Client integration columns", "Run npm run admin:migrate against this deployment's database.");
  } catch (error) {
    const detail = String(error?.message || error || "Unknown database error")
      .replace(process.env.DATABASE_URL || "", "[database URL removed]")
      .slice(0, 240);
    check(
      false,
      "Database connection",
      `${detail}. Check DATABASE_URL, network access, and the PostgreSQL provider status.`,
    );
  }
  finally { await db.end().catch(() => {}); }
}
console.log("This checks configuration and schema only. Verify domain registration, matching backend settings, API billing, and a real client reply before release. See docs/CHATKIT_SETUP.md.");
process.exitCode = failures ? 1 : 0;
