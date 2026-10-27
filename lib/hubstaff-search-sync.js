import "server-only";
import { randomUUID } from "node:crypto";
import { databasePool } from "./database.js";
import { createHubstaffSearchReader } from "./hubstaff.js";
import { hubstaffSearchScope, indexTask, indexComment } from "./hubstaff-search-policy.js";

async function clientScope(clientId, db = databasePool, lock = false) {
  const {rows} = await db.query(`SELECT id,hubstaff_project_url FROM portal_clients
    WHERE id=$1 AND portal_enabled=TRUE AND ai_enabled=TRUE ${lock ? "FOR SHARE" : ""}`, [clientId]);
  return rows[0] ? hubstaffSearchScope(clientId, rows[0].hubstaff_project_url) : null;
}

async function writeBatch(scope, token, apply) {
  const db = await databasePool.connect();
  try {
    await db.query("BEGIN");
    const current = await clientScope(scope.clientId, db, true);
    const {rows} = await db.query(`SELECT * FROM portal_hubstaff_search_indexes WHERE client_id=$1
      AND lease_token=$2 AND lease_until>NOW() FOR UPDATE`, [scope.clientId, token]);
    if (!current || current.binding !== scope.binding || current.mappingUrl !== scope.mappingUrl || !rows[0]) throw new Error("index_scope_changed");
    const result = await apply(db, rows[0]);
    await db.query("COMMIT");
    return result;
  } catch (error) { await db.query("ROLLBACK"); throw error; }
  finally { db.release(); }
}

export async function synchronizeHubstaffSearch(clientId, {signal, taskPages = 2, commentPages = 8} = {}) {
  const scope = await clientScope(clientId);
  if (!scope) return { skipped:true, code:"no_assigned_project" };
  const token = randomUUID();
  const {rows} = await databasePool.query(`INSERT INTO portal_hubstaff_search_indexes
    (client_id,binding,mapping_url,project_url,organization_id,project_id,lease_token,lease_until)
    VALUES($1,$3,$4,$5,$6,$7,$2,NOW()+INTERVAL '150 seconds') ON CONFLICT(client_id) DO UPDATE
      SET lease_token=$2,lease_until=EXCLUDED.lease_until
      WHERE (portal_hubstaff_search_indexes.lease_until IS NULL OR portal_hubstaff_search_indexes.lease_until<NOW())
        AND (portal_hubstaff_search_indexes.checked_at IS NULL OR portal_hubstaff_search_indexes.checked_at<NOW()-INTERVAL '10 seconds'
          OR portal_hubstaff_search_indexes.binding IS DISTINCT FROM $3)
      RETURNING client_id`, [clientId,token,scope.binding,scope.mappingUrl,scope.projectUrl,scope.organizationId,scope.projectId]);
  if (!rows.length) return {skipped:true,code:"recent_or_running"};
  let syncedTasks = 0;
  let syncedComments = 0;
  try {
    const reader = await createHubstaffSearchReader(scope.projectUrl, signal);
    const metadata = await reader.metadata();
    signal?.throwIfAborted();
    let state = await writeBatch(scope, token, async (db, old) => {
      if (old.binding !== scope.binding || old.mapping_url !== scope.mappingUrl) {
        await db.query("DELETE FROM portal_hubstaff_search_tasks WHERE client_id=$1", [clientId]);
        await db.query(`UPDATE portal_hubstaff_search_indexes SET binding=$2,mapping_url=$3,project_url=$4,
          organization_id=$5,project_id=$6,generation=0,scan_active=FALSE,task_cursor=NULL,metadata_complete=FALSE,
          metadata_completed_at=NULL,next_scan_at=NULL WHERE client_id=$1`,
        [clientId,scope.binding,scope.mappingUrl,scope.projectUrl,scope.organizationId,scope.projectId]);
      }
      const result = await db.query(`UPDATE portal_hubstaff_search_indexes SET members=$2::jsonb,
        checked_at=NOW(),failure_code=NULL WHERE client_id=$1 RETURNING *`, [clientId,JSON.stringify(metadata.members)]);
      return result.rows[0];
    });
    if (!state.scan_active && (!state.next_scan_at || new Date(state.next_scan_at) <= new Date())) {
      state = await writeBatch(scope, token, async db => (await db.query(`UPDATE portal_hubstaff_search_indexes
        SET generation=generation+1,scan_active=TRUE,task_cursor=NULL WHERE client_id=$1 RETURNING *`, [clientId])).rows[0]);
    }
    for (let page = 0; state.scan_active && page < Math.min(10, taskPages); page++) {
      signal?.throwIfAborted();
      const data = await reader.tasks(state.task_cursor);
      const tasks = data.items.map(task => indexTask(task,metadata.columns,metadata.members));
      state = await writeBatch(scope, token, async (db, locked) => {
        if (String(locked.task_cursor) !== String(state.task_cursor)) throw new Error("index_cursor_changed");
        if (tasks.length) await db.query(`INSERT INTO portal_hubstaff_search_tasks
          (client_id,task_id,list_id,title,description,column_name,done,assignee_names,people_complete,
            created_at,updated_at,completed_at,activity_at,fingerprint,seen_generation,content_truncated)
          SELECT $1,x.task_id,x.list_id,x.title,x.description,x.column_name,x.done,x.assignee_names,x.people_complete,
            x.created_at,x.updated_at,x.completed_at,x.activity_at,x.fingerprint,$3,x.content_truncated
          FROM jsonb_to_recordset($2::jsonb) AS x(task_id BIGINT,list_id BIGINT,title TEXT,description TEXT,column_name TEXT,
            done BOOLEAN,assignee_names TEXT[],people_complete BOOLEAN,created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,
            completed_at TIMESTAMPTZ,activity_at TIMESTAMPTZ,fingerprint TEXT,content_truncated BOOLEAN)
          ON CONFLICT(client_id,task_id) DO UPDATE SET list_id=EXCLUDED.list_id,title=EXCLUDED.title,
            description=EXCLUDED.description,column_name=EXCLUDED.column_name,done=EXCLUDED.done,assignee_names=EXCLUDED.assignee_names,
            people_complete=EXCLUDED.people_complete,created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,
            completed_at=EXCLUDED.completed_at,activity_at=GREATEST(EXCLUDED.activity_at,
              (SELECT MAX(GREATEST(c.created_at,c.updated_at)) FROM portal_hubstaff_search_comments c
                WHERE c.client_id=EXCLUDED.client_id AND c.task_id=EXCLUDED.task_id)),
            comments_pending=portal_hubstaff_search_tasks.comments_pending OR portal_hubstaff_search_tasks.fingerprint<>EXCLUDED.fingerprint,
            comments_cursor=CASE WHEN portal_hubstaff_search_tasks.fingerprint<>EXCLUDED.fingerprint THEN NULL ELSE portal_hubstaff_search_tasks.comments_cursor END,
            comments_generation=portal_hubstaff_search_tasks.comments_generation+CASE WHEN portal_hubstaff_search_tasks.fingerprint<>EXCLUDED.fingerprint THEN 1 ELSE 0 END,
            fingerprint=EXCLUDED.fingerprint,seen_generation=EXCLUDED.seen_generation,content_truncated=EXCLUDED.content_truncated`,
        [clientId,JSON.stringify(tasks),state.generation]);
        if (!data.next) await db.query("DELETE FROM portal_hubstaff_search_tasks WHERE client_id=$1 AND seen_generation<>$2", [clientId,state.generation]);
        return (await db.query(`UPDATE portal_hubstaff_search_indexes SET task_cursor=$2,scan_active=$3,
          metadata_complete=metadata_complete OR $4,metadata_completed_at=CASE WHEN $4 THEN NOW() ELSE metadata_completed_at END,
          next_scan_at=CASE WHEN $4 THEN NOW()+INTERVAL '5 minutes' ELSE next_scan_at END WHERE client_id=$1 RETURNING *`,
        [clientId,data.next,Boolean(data.next),!data.next])).rows[0];
      });
      syncedTasks += tasks.length;
    }
    // Recheck older discussion pages even when task.updated_at does not change.
    await writeBatch(scope,token, db => db.query(`UPDATE portal_hubstaff_search_tasks SET comments_pending=TRUE,
      comments_cursor=NULL,comments_generation=comments_generation+1 WHERE client_id=$1 AND task_id IN
      (SELECT task_id FROM portal_hubstaff_search_tasks WHERE client_id=$1 AND NOT comments_pending
        AND comments_checked_at<NOW()-INTERVAL '15 minutes' ORDER BY comments_checked_at LIMIT 4)`, [clientId]));
    for (let page = 0; page < Math.min(30, commentPages); page++) {
      signal?.throwIfAborted();
      const queue = await databasePool.query(`SELECT task_id,comments_cursor,comments_generation FROM portal_hubstaff_search_tasks
        WHERE client_id=$1 AND comments_pending ORDER BY comments_checked_at NULLS FIRST,updated_at DESC NULLS LAST,task_id LIMIT 1`, [clientId]);
      const task = queue.rows[0];
      if (!task) break;
      let data;
      try { data = await reader.comments(task.task_id, task.comments_cursor, metadata.columns); }
      catch (error) {
        if (error.message === "task_moved_outside_project" || error?.publicDetails?.httpStatus === 404) {
          await writeBatch(scope,token, db => db.query("DELETE FROM portal_hubstaff_search_tasks WHERE client_id=$1 AND task_id=$2",[clientId,task.task_id]));
          continue;
        }
        throw error;
      }
      const comments = data.items.map(comment => indexComment(comment, task.task_id, metadata.members));
      await writeBatch(scope,token, async db => {
        if (comments.length) await db.query(`INSERT INTO portal_hubstaff_search_comments
          (client_id,task_id,comment_id,author_name,content,created_at,updated_at,seen_generation,content_truncated)
          SELECT $1,$2,x.comment_id,x.author_name,x.content,x.created_at,x.updated_at,$4,x.content_truncated
          FROM jsonb_to_recordset($3::jsonb) AS x(comment_id BIGINT,author_name TEXT,content TEXT,
            created_at TIMESTAMPTZ,updated_at TIMESTAMPTZ,content_truncated BOOLEAN)
          ON CONFLICT(client_id,task_id,comment_id) DO UPDATE SET author_name=EXCLUDED.author_name,content=EXCLUDED.content,
            created_at=EXCLUDED.created_at,updated_at=EXCLUDED.updated_at,seen_generation=EXCLUDED.seen_generation,content_truncated=EXCLUDED.content_truncated`,
        [clientId,task.task_id,JSON.stringify(comments),task.comments_generation]);
        if (!data.next) await db.query(`DELETE FROM portal_hubstaff_search_comments WHERE client_id=$1 AND task_id=$2 AND seen_generation<>$3`,
          [clientId,task.task_id,task.comments_generation]);
        await db.query(`UPDATE portal_hubstaff_search_tasks SET comments_cursor=$3,comments_pending=$4,
          comments_checked_at=CASE WHEN $4 THEN comments_checked_at ELSE NOW() END,
          activity_at=GREATEST(created_at,updated_at,completed_at,(SELECT MAX(GREATEST(c.created_at,c.updated_at)) FROM portal_hubstaff_search_comments c WHERE c.client_id=$1 AND c.task_id=$2))
          WHERE client_id=$1 AND task_id=$2`, [clientId,task.task_id,data.next,Boolean(data.next)]);
      });
      syncedComments += comments.length;
    }
    await writeBatch(scope,token, db => db.query(`UPDATE portal_hubstaff_search_indexes SET checked_at=NOW(),
      task_count=(SELECT COUNT(*) FROM portal_hubstaff_search_tasks WHERE client_id=$1),
      comment_count=(SELECT COUNT(*) FROM portal_hubstaff_search_comments WHERE client_id=$1),
      pending_tasks=(SELECT COUNT(*) FROM portal_hubstaff_search_tasks WHERE client_id=$1 AND comments_pending),
      unresolved_people_tasks=(SELECT COUNT(*) FROM portal_hubstaff_search_tasks WHERE client_id=$1 AND NOT people_complete),
      lease_token=NULL,lease_until=NULL WHERE client_id=$1`,[clientId]));
    return {clientId:String(clientId),syncedTasks,syncedComments,metadataComplete:state.metadata_complete};
  } catch (error) {
    await databasePool.query(`UPDATE portal_hubstaff_search_indexes SET failure_code=$3,lease_token=NULL,lease_until=NULL
      WHERE client_id=$1 AND lease_token=$2`, [clientId,token,error?.publicDetails?.httpStatus === 403 || error?.publicDetails?.httpStatus === 401 ? "access_denied" : "sync_failed"]);
    throw error;
  }
}

export async function synchronizeAllHubstaffSearch({signal} = {}) {
  const {rows} = await databasePool.query(`SELECT p.id FROM portal_clients p
    LEFT JOIN portal_hubstaff_search_indexes i ON i.client_id=p.id
    WHERE p.portal_enabled=TRUE AND p.ai_enabled=TRUE
      AND BTRIM(p.hubstaff_project_url) ~ '^https://tasks[.]hubstaff[.]com/app/organizations/[1-9][0-9]*/projects/[1-9][0-9]*/?$'
    ORDER BY i.checked_at ASC NULLS FIRST,p.id LIMIT 100`);
  const results = [];
  for (const row of rows) {
    signal?.throwIfAborted();
    try { results.push(await synchronizeHubstaffSearch(String(row.id), {signal})); }
    catch { results.push({clientId:String(row.id),code:"sync_failed"}); }
  }
  return {results};
}
