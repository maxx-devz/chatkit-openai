import "server-only";
import { databasePool } from "./database.js";
import { hubstaffSearchScope, searchIndexState } from "./hubstaff-search-policy.js";

export const SEARCH_COUNTS = `
  (SELECT COUNT(*) FROM portal_hubstaff_search_tasks t WHERE t.client_id=i.client_id) AS task_count,
  (SELECT COUNT(*) FROM portal_hubstaff_search_tasks t WHERE t.client_id=i.client_id AND t.comments_pending) AS pending_tasks,
  (SELECT COUNT(*) FROM portal_hubstaff_search_tasks t WHERE t.client_id=i.client_id AND NOT t.people_complete) AS unresolved_people_tasks,
  (SELECT COUNT(*) FROM portal_hubstaff_search_comments c WHERE c.client_id=i.client_id) AS comment_count`;

export async function hubstaffSearchStatus(clientId, mappingUrl) {
  const scope = hubstaffSearchScope(clientId, mappingUrl);
  if (!scope) return null;
  try {
    const { rows } = await databasePool.query(`SELECT i.* FROM portal_hubstaff_search_indexes i
      JOIN portal_clients p ON p.id=i.client_id AND BTRIM(p.hubstaff_project_url)=i.mapping_url
      WHERE i.client_id=$1 AND p.portal_enabled=TRUE AND p.ai_enabled=TRUE`, [clientId]);
    const state = searchIndexState(rows[0], scope);
    return { state, binding: state.available ? scope.binding : "", projectUrl: scope.projectUrl,
      organizationId: scope.organizationId, projectId: scope.projectId };
  } catch (error) {
    if (error.code === "42P01") return null;
    throw error;
  }
}

export async function indexedHubstaffSnapshot(clientId, mappingUrl) {
  const result = await hubstaffSearchStatus(clientId, mappingUrl);
  if (!result) return null;
  return { binding: result.binding, snapshot: { configured: true, available: result.state.available,
    project: {id:result.projectId, organizationId:result.organizationId, url:result.projectUrl},
    index: result.state, source: {fetchedAt: result.state.checkedAt, indexedSearch: true,
      partial: !result.state.metadataComplete || Boolean(result.state.pendingTasks)} } };
}

export async function adminHubstaffSearchStatus() {
  const {rows} = await databasePool.query(`SELECT p.id,p.slug,p.display_name,p.hubstaff_project_url,
    i.binding,i.mapping_url,i.checked_at,i.failure_code,i.metadata_complete,i.metadata_completed_at,i.lease_until,
    ${SEARCH_COUNTS} FROM portal_clients p LEFT JOIN portal_hubstaff_search_indexes i ON i.client_id=p.id
    WHERE p.portal_enabled=TRUE AND p.ai_enabled=TRUE ORDER BY p.display_name`);
  return { clients: rows.flatMap(row => {
    const scope = hubstaffSearchScope(row.id, row.hubstaff_project_url);
    return scope ? [{id:String(row.id),name:row.display_name,slug:row.slug,
      ...searchIndexState(row.binding ? row : null, scope), syncing:Boolean(row.lease_until && new Date(row.lease_until)>new Date())}] : [];
  }) };
}
