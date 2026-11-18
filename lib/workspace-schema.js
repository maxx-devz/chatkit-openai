import { workspaceError } from "./workspace-selection.js";

// A pre-agency installation can use its legacy memberships. Once adoption has
// started, authorization requires the complete context migration.
export async function workspaceSchemaReady(db) {
  const { rows } = await db.query(`SELECT to_regnamespace('agency_platform') IS NOT NULL AS foundation,
    EXISTS(SELECT 1 FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='agency_platform' AND c.relname='support_grants' AND c.relkind='r') AS ready`);
  if (rows[0]?.ready) return true;
  if (rows[0]?.foundation === false) return false;
  throw workspaceError("workspace_setup_required", "Workspace authorization setup is incomplete.", 503);
}
