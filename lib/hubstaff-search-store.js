import "server-only";
import { databasePool } from "./database.js";
import { createHubstaffSearchReader } from "./hubstaff.js";
import { hubstaffSearchScope, searchIndexState, adminIndexProgress } from "./hubstaff-search-policy.js";

export const SEARCH_COUNTS = `
  (SELECT COUNT(*) FROM portal_hubstaff_search_tasks t WHERE t.client_id=i.client_id) AS task_count,
  (SELECT COUNT(*) FROM portal_hubstaff_search_tasks t WHERE t.client_id=i.client_id AND t.comments_pending) AS pending_tasks,
  (SELECT COUNT(*) FROM portal_hubstaff_search_tasks t WHERE t.client_id=i.client_id AND NOT t.people_complete) AS unresolved_people_tasks,
  (SELECT COUNT(*) FROM portal_hubstaff_search_comments c WHERE c.client_id=i.client_id) AS comment_count`;

export async function hubstaffSearchStatus(clientId, mappingUrl, {verifyAccess = false, signal} = {}) {
  const scope = hubstaffSearchScope(clientId, mappingUrl);
  if (!scope) return null;
  try {
    let { rows } = await databasePool.query(`SELECT i.* FROM portal_hubstaff_search_indexes i
      JOIN portal_clients p ON p.id=i.client_id AND BTRIM(p.hubstaff_project_url)=i.mapping_url
      WHERE i.client_id=$1 AND p.portal_enabled=TRUE AND p.ai_enabled=TRUE`, [clientId]);
    // Recover an existing index with a bounded permission/metadata read, never a task-history scan.
    if (verifyAccess && rows[0]?.binding === scope.binding && rows[0].mapping_url === scope.mappingUrl
      && !searchIndexState(rows[0], scope).available) {
      try {
        const accessSignal = AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(10_000)]);
        const reader = await createHubstaffSearchReader(scope.projectUrl, accessSignal);
        const metadata = await reader.metadata();
        accessSignal.throwIfAborted();
        const updated = await databasePool.query(`UPDATE portal_hubstaff_search_indexes i
          SET checked_at=NOW(),failure_code=NULL,members=$4::jsonb
          FROM portal_clients p WHERE i.client_id=$1 AND i.binding=$2 AND i.mapping_url=$3
          AND p.id=i.client_id AND BTRIM(p.hubstaff_project_url)=i.mapping_url
          AND p.portal_enabled=TRUE AND p.ai_enabled=TRUE RETURNING i.*`,
        [clientId,scope.binding,scope.mappingUrl,JSON.stringify(metadata.members)]);
        rows = updated.rows;
      } catch (error) {
        if ([401,403].includes(error?.publicDetails?.httpStatus)) {
          await databasePool.query(`UPDATE portal_hubstaff_search_indexes SET failure_code='access_denied'
            WHERE client_id=$1 AND binding=$2 AND mapping_url=$3`, [clientId,scope.binding,scope.mappingUrl]);
        }
        // Never turn a failed check into usable cached client data.
        rows = rows.map(row => ({...row,failure_code:"access_unverified"}));
      }
    }
    const state = searchIndexState(rows[0], scope);
    return { state, binding: state.available ? scope.binding : "", projectUrl: scope.projectUrl,
      organizationId: scope.organizationId, projectId: scope.projectId };
  } catch (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
}

export async function indexedHubstaffSnapshot(clientId, mappingUrl, options) {
  const result = await hubstaffSearchStatus(clientId, mappingUrl, options);
  if (!result) return null;
  return { binding: result.binding, snapshot: { configured: true, available: result.state.available,
    project: {id:result.projectId, organizationId:result.organizationId, url:result.projectUrl},
    index: result.state, source: {fetchedAt: result.state.checkedAt, indexedSearch: true,
      partial: !result.state.metadataComplete || Boolean(result.state.pendingTasks)} } };
}

export async function adminHubstaffSearchStatus() {
  const {rows} = await databasePool.query(`SELECT p.id,p.slug,p.display_name,p.hubstaff_project_url,
    i.binding,i.mapping_url,i.checked_at,i.failure_code,i.metadata_complete,i.metadata_completed_at,i.lease_until,i.scan_active,
    i.last_attempt_at,i.last_batch_at,i.next_attempt_at,
    ${SEARCH_COUNTS} FROM portal_clients p LEFT JOIN portal_hubstaff_search_indexes i ON i.client_id=p.id
    WHERE p.portal_enabled=TRUE AND p.ai_enabled=TRUE ORDER BY p.display_name`);
  return { clients: rows.flatMap(row => {
    const scope = hubstaffSearchScope(row.id, row.hubstaff_project_url);
    return scope ? [{id:String(row.id),name:row.display_name,slug:row.slug,
      ...adminIndexProgress(row, scope)}] : [];
  }) };
}
