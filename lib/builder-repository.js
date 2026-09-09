import { createHash } from "node:crypto";
import { DEFAULT_BUILDER_CONFIG, builderError, validateBuilderConfig } from "./builder-config.js";

export function liveConfig(client, row) {
  return validateBuilderConfig({ ...DEFAULT_BUILDER_CONFIG, ...row?.published,
    instructions: client.assistant_instructions || "", vectorStoreId: client.openai_vector_store_id || "" });
}
export function fingerprint(config) {
  return createHash("sha256").update(JSON.stringify(validateBuilderConfig(config))).digest("hex");
}
export async function readBuilder(db, clientId) {
  const { rows } = await db.query("SELECT * FROM portal_clients WHERE id=$1", [clientId]);
  if (!rows.length) throw builderError("Client not found.", 404);
  const client = rows[0];
  const row = (await db.query("SELECT * FROM portal_assistant_configs WHERE client_id=$1", [clientId])).rows[0];
  const live = liveConfig(client, row);
  return { clientId: String(client.id), name: client.display_name, draft: row?.draft || live,
    live, revision: row?.revision || 0, publishedVersion: row?.published_version || 0,
    publishedAt: row?.published_at || null, liveFingerprint: fingerprint(live),
    conflict: Boolean(row && row.base_fingerprint !== fingerprint(live)),
    history: (await db.query("SELECT version, config, published_at FROM portal_assistant_versions WHERE client_id=$1 ORDER BY version DESC LIMIT 10", [clientId])).rows };
}

// Caller owns a transaction. Lock client first in every mutation; revisions reject stale tabs.
export async function mutateBuilder(db, { clientId, revision, action, config, liveFingerprint }, adminId) {
  if (!/^[1-9][0-9]{0,18}$/.test(clientId || "") || !Number.isInteger(revision) || revision < 0
    || !["save", "publish", "reset"].includes(action)) throw builderError("Invalid builder request.");
  if (!(await db.query("SELECT id FROM portal_clients WHERE id=$1 FOR UPDATE", [clientId])).rows.length) throw builderError("Client not found.", 404);
  const state = await readBuilder(db, clientId);
  if (state.revision !== revision) throw builderError("Another editor changed this draft. Reload before saving.", 409);
  if (liveFingerprint !== state.liveFingerprint) throw builderError("Live settings changed. Reload before continuing.", 409);
  if (action === "publish") {
    if (!revision) throw builderError("Save your draft before publishing.");
    if (state.conflict) throw builderError("Live instructions changed outside the builder. Reset to live, then reapply your draft.", 409);
    const value = validateBuilderConfig(state.draft);
    const version = state.publishedVersion + 1;
    await db.query("UPDATE portal_clients SET assistant_instructions=$2, openai_vector_store_id=$3, updated_at=NOW() WHERE id=$1", [clientId, value.instructions, value.vectorStoreId || null]);
    await db.query("INSERT INTO portal_assistant_versions(client_id,version,config,published_by) VALUES($1,$2,$3,$4)", [clientId, version, value, adminId]);
    await db.query("UPDATE portal_assistant_configs SET published=$2,draft=$2,published_version=$3,revision=revision+1,base_fingerprint=$4,updated_by=$5,updated_at=NOW(),published_at=NOW() WHERE client_id=$1", [clientId, value, version, fingerprint(value), adminId]);
  } else {
    const value = action === "reset" ? state.live : validateBuilderConfig(config);
    await db.query(`INSERT INTO portal_assistant_configs(client_id,draft,revision,base_fingerprint,updated_by)
      VALUES($1,$2,1,$3,$4) ON CONFLICT(client_id) DO UPDATE SET draft=$2,revision=portal_assistant_configs.revision+1,
      base_fingerprint=CASE WHEN $5 THEN $3 ELSE portal_assistant_configs.base_fingerprint END,updated_by=$4,updated_at=NOW()`,
    [clientId, value, state.liveFingerprint, adminId, action === "reset"]);
  }
  return readBuilder(db, clientId);
}
