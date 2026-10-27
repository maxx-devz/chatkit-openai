// Server callers supply the database client and authenticated administrator ID.
export async function readSiteModel(sql, provider) {
  try {
    const rows = await sql`
      SELECT model, updated_at FROM portal_site_ai_settings WHERE provider=${provider.id}
    `;
    return { model: rows[0]?.model || provider.model, source: rows[0] ? "admin" : "environment",
      updatedAt: rows[0]?.updated_at || null, ready: true };
  } catch (error) {
    // Old deployments remain usable until the additive migration is applied.
    if (error?.code !== "42P01") throw error;
    return { model: provider.model, source: "environment", updatedAt: null, ready: false };
  }
}

export function validateSiteModel(model, catalog) {
  if (typeof model !== "string" || !model.trim() || model.length > 200) {
    throw new Error("Choose a model from the model list.");
  }
  const candidate = catalog.models.find((item) => item.id === model.trim());
  if (!catalog.verified || !candidate) throw new Error("Refresh the model list before saving a model.");
  if (candidate.supportsTools === false) {
    throw new Error("This model does not support the tools required by client chat. Choose a tool-capable model.");
  }
  return candidate.id;
}

export async function writeSiteModel(sql, provider, model, adminId) {
  const rows = await sql`
    WITH saved AS (INSERT INTO portal_site_ai_settings (provider, model, updated_by)
    VALUES (${provider.id}, ${model}, ${String(adminId)})
    ON CONFLICT (provider) DO UPDATE
      SET model=EXCLUDED.model, updated_by=EXCLUDED.updated_by, updated_at=NOW()
    RETURNING model, updated_at), logged AS (
      INSERT INTO portal_audit_events(audience,actor_user_id,action,target_type,target_id)
      SELECT 'aoc_admin',${String(adminId)},'aoc.model.update','model',${provider.id} FROM saved
      RETURNING id
    ) SELECT model,updated_at FROM saved
  `;
  return { model: rows[0].model, source: "admin", updatedAt: rows[0].updated_at, ready: true };
}
