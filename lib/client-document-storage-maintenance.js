import {assertDocumentStoragePath} from './client-document-storage-path.js';
export async function storageLifecycleReady(db){return Boolean((await db.query("SELECT to_regclass('portal_client_document_storage_cleanup') IS NOT NULL ready")).rows[0]?.ready);}
export async function queueDocumentCleanup(db,row,path=row.object_path){
 assertDocumentStoragePath(String(row.client_id),row.id,path);
 await db.query(`INSERT INTO portal_client_document_storage_cleanup(file_id,client_id,object_path,final_check_after)
 VALUES($1,$2,$3,GREATEST(now(),COALESCE($4::timestamptz,now()+interval '125 minutes')+interval '24 hours'))
 ON CONFLICT(file_id,object_path) DO UPDATE SET finished_at=NULL,next_attempt_at=now(),last_deleted_at=NULL,last_error=NULL,final_check_after=GREATEST(portal_client_document_storage_cleanup.final_check_after,EXCLUDED.final_check_after)`,[row.id,row.client_id,path,row.upload_grant_expires_at]);
}
export async function documentCleanupSummary(db,client){
 if(!await storageLifecycleReady(db))return {setupNeeded:true,pending:0,followUp:0};
 const row=(await db.query(`SELECT count(*) FILTER(WHERE last_deleted_at IS NULL OR last_error IS NOT NULL)::int pending,count(*) FILTER(WHERE last_deleted_at IS NOT NULL AND last_error IS NULL)::int follow_up FROM portal_client_document_storage_cleanup WHERE client_id=$1 AND finished_at IS NULL`,[client])).rows[0];return {setupNeeded:false,pending:row.pending,followUp:row.follow_up};
}
export async function sweepDocumentStorage({transaction,config,remove,client=null,limit=5,retry=false,fileId=null}){
 if(!Number.isInteger(limit)||limit<1||limit>20)throw Error('Bound cleanup work');
 const counts={removed:0,failed:0,protected:0};const handled=[];
 for(let n=0;n<limit;n++){
  const worked=await transaction(async db=>{
   const row=(await db.query(`SELECT j.id AS job_id,j.object_path AS cleanup_path,GREATEST(j.final_check_after,COALESCE(f.upload_grant_expires_at,f.created_at+interval '125 minutes')+interval '24 hours') AS effective_final_check,f.* FROM portal_client_document_storage_cleanup j JOIN portal_client_document_objects f ON f.id=j.file_id AND f.client_id=j.client_id
   WHERE j.finished_at IS NULL AND ($1::bigint IS NULL OR j.client_id=$1) AND ($4::uuid IS NULL OR j.file_id=$4) AND j.id<>ALL($2::bigint[]) AND (j.next_attempt_at<=now() OR ($3 AND (j.last_deleted_at IS NULL OR j.last_error IS NOT NULL))) ORDER BY j.next_attempt_at,j.id LIMIT 1 FOR UPDATE OF j,f SKIP LOCKED`,[client,handled,retry,fileId])).rows[0];
   if(!row)return false;handled.push(String(row.job_id));
   if(row.storage_origin!==config.origin||row.bucket!==config.bucket)throw Error('Storage owner changed');
   assertDocumentStoragePath(String(row.client_id),row.id,row.cleanup_path);
   if(!row.archived_at&&row.object_path===row.cleanup_path){await db.query("UPDATE portal_client_document_storage_cleanup SET finished_at=now(),last_error=NULL WHERE id=$1",[row.job_id]);counts.protected++;return true;}
   try{await remove(row.cleanup_path);await db.query(`UPDATE portal_client_document_storage_cleanup SET attempts=attempts+1,last_deleted_at=now(),last_error=NULL,final_check_after=$2,finished_at=CASE WHEN $2::timestamptz<=now() THEN now() END,next_attempt_at=LEAST(now()+interval '5 minutes',GREATEST(now(),$2::timestamptz)) WHERE id=$1`,[row.job_id,row.effective_final_check]);counts.removed++;}
   catch{await db.query(`UPDATE portal_client_document_storage_cleanup SET attempts=attempts+1,last_error='storage_cleanup_failed',next_attempt_at=now()+make_interval(secs=>LEAST(3600,(30*power(2,LEAST(attempts,7)))::int)) WHERE id=$1`,[row.job_id]);counts.failed++;}
   return true;
  });if(!worked)break;
 }
 return counts;
}

export async function enqueueDocumentStorageMaintenance(db,config,client=null,includeArchived=false){
 const rows=(await db.query(`SELECT f.* FROM portal_client_document_objects f WHERE ($1::bigint IS NULL OR client_id=$1) AND storage_origin=$2 AND bucket=$3
 AND (($4 AND archived_at IS NOT NULL) OR state='pending' AND upload_grant_expires_at+interval '24 hours'<=now())
 AND NOT EXISTS(SELECT 1 FROM portal_client_document_storage_cleanup j WHERE j.file_id=f.id AND j.object_path=f.object_path)
 ORDER BY created_at LIMIT 50 FOR UPDATE OF f SKIP LOCKED`,[client,config.origin,config.bucket,includeArchived])).rows;
 for(const row of rows){if(!row.archived_at){await db.query("UPDATE portal_client_document_objects SET state='rejected',archived_at=now(),updated_at=now(),revision=revision+1 WHERE id=$1",[row.id]);}await queueDocumentCleanup(db,row);}
 return rows.length;
}
