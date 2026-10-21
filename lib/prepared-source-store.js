import "server-only";
import { databasePool } from "./database.js";
import { driveConfiguration, sealDriveValue, unsealDriveValue, DriveSourceError } from "./drive-source-policy.js";
import { sourceConnectionBinding } from "./drive-source-auto.js";
import { assertPreparedSourceFreshness, validateSourcePublication, sourceFolders } from "./prepared-source-policy.js";

export function preparedBinding(row) {
  const config = driveConfiguration();
  const connected = row?.google_email === config.email && row?.root_folder_id === config.rootId
    && row?.oauth_client_id === config.clientId && row?.administrator_active === true;
  return sourceConnectionBinding({ connected, email: row?.google_email, rootFolderId: row?.root_folder_id,
    connectedAt: row?.connected_at }, config.clientId);
}

export function decodePreparedDocuments(row) {
  try {
    const text = unsealDriveValue(row.encrypted_documents, "prepared:" + row.owner_id + ":" + row.binding, driveConfiguration().secret);
    const documents = JSON.parse(text);
    if (!Array.isArray(documents) || documents.some(doc => typeof doc.text !== "string" || typeof doc.path !== "string")) throw new Error();
    return documents;
  } catch {
    throw new DriveSourceError("prepared_sources_unreadable", "Prepared sources could not be decrypted. Check the stable Google Drive encryption key and synchronize again.", 503);
  }
}

export function encodePreparedDocuments(ownerId, binding, documents) {
  return sealDriveValue(JSON.stringify(documents), "prepared:" + ownerId + ":" + binding, driveConfiguration().secret);
}

const joins = `LEFT JOIN portal_prepared_source_indexes i ON i.owner_id=p.owner_id
  LEFT JOIN portal_drive_source_connections c ON c.owner_id=p.owner_id
  LEFT JOIN portal_admins a ON a.user_id=p.owner_id`;
const fields = `p.*, i.binding, i.encrypted_documents, i.checked_at, i.failure_code,
  c.google_email, c.root_folder_id, c.oauth_client_id, c.connected_at, a.is_active AS administrator_active`;

export async function findPreparedPublication({ ownerId, clientId }) {
  try {
    const { rows } = clientId
      ? await databasePool.query(`SELECT ${fields} FROM portal_source_publications p ${joins} WHERE p.client_id=$1`, [clientId])
      : await databasePool.query(`SELECT ${fields} FROM portal_source_publications p ${joins} WHERE p.owner_id=$1 AND p.audience='admin'`, [ownerId]);
    return rows[0] || null;
  } catch (error) {
    // An undeployed optional migration must not break existing, unconfigured chats.
    if (error.code === "42P01") return null;
    throw error;
  }
}

export function publicationRecord(row) {
  return { clientId: row.client_id === null ? null : String(row.client_id), enabled: row.enabled,
    referencePaths: row.reference_paths, instructionIds: row.instruction_ids,
    additionalInstructions: row.additional_instructions, generalReferences: row.general_references,
    updatedAt: row.updated_at };
}

export async function preparedSourcesStatus(ownerId) {
  const { rows } = await databasePool.query(`SELECT i.*,c.google_email,c.root_folder_id,c.oauth_client_id,c.connected_at,
    a.is_active AS administrator_active FROM portal_prepared_source_indexes i
    LEFT JOIN portal_drive_source_connections c ON c.owner_id=i.owner_id
    LEFT JOIN portal_admins a ON a.user_id=i.owner_id WHERE i.owner_id=$1`, [ownerId]);
  const index = rows[0];
  let documents = [];
  let ready = false;
  if (index?.encrypted_documents) {
    try { assertPreparedSourceFreshness(index, preparedBinding(index)); documents = decodePreparedDocuments(index); ready = true; }
    catch { /* Status exposes no stale/decrypted source text after connection failure. */ }
  }
  const [publications, clients] = await Promise.all([
    databasePool.query("SELECT * FROM portal_source_publications WHERE owner_id=$1 ORDER BY audience", [ownerId]),
    databasePool.query("SELECT id,display_name FROM portal_clients ORDER BY display_name LIMIT 1000"),
  ]);
  return { ready, checkedAt: index?.checked_at || null, failureCode: index?.failure_code || "", sync: index?.sync_info || {},
    syncing: Boolean(index?.lease_until && new Date(index.lease_until) > new Date()),
    documents: documents.map(({ id, name, path, version, text }) => ({ id, name, path, version, characters: text.length })),
    folders: sourceFolders(documents), publications: publications.rows.map(publicationRecord),
    clients: clients.rows.map(client => ({ id: String(client.id), name: client.display_name })) };
}

export async function savePreparedPublication(ownerId, input) {
  const status = await preparedSourcesStatus(ownerId);
  // Disable remains possible after revoked access, expired cache or missing documents.
  if (input.action === "disable") {
    const clientId = input.clientId || null;
    const audience = clientId === null ? "admin" : "client:" + clientId;
    await databasePool.query("UPDATE portal_source_publications SET enabled=FALSE,updated_at=NOW() WHERE owner_id=$1 AND audience=$2", [ownerId, audience]);
    return preparedSourcesStatus(ownerId);
  }
  if (!status.ready) throw new DriveSourceError("prepared_sources_unavailable", "Synchronize sources before approving this publication.", 409);
  const { rows } = await databasePool.query("SELECT * FROM portal_prepared_source_indexes WHERE owner_id=$1", [ownerId]);
  const publication = validateSourcePublication(input, decodePreparedDocuments(rows[0]));
  if (publication.clientId && !status.clients.some(client => client.id === publication.clientId)) {
    throw new DriveSourceError("invalid_audience", "Choose an existing portal client.");
  }
  try {
    await databasePool.query(`INSERT INTO portal_source_publications
      (owner_id,audience,client_id,enabled,reference_paths,instruction_ids,additional_instructions,general_references)
      VALUES($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8)
      ON CONFLICT(owner_id,audience) DO UPDATE SET enabled=$4,reference_paths=$5::jsonb,instruction_ids=$6::jsonb,
        additional_instructions=$7,general_references=$8,updated_at=NOW()`,
    [ownerId, publication.audience, publication.clientId, publication.enabled, JSON.stringify(publication.referencePaths),
      JSON.stringify(publication.instructionIds), publication.additionalInstructions, publication.generalReferences]);
  } catch (error) {
    if (error.code === "23505") throw new DriveSourceError("publication_owner_conflict", "Another administrator manages this client's prepared-source publication. Ask that administrator to update its settings.", 409);
    throw error;
  }
  return preparedSourcesStatus(ownerId);
}
