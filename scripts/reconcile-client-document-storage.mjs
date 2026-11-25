import {databasePool as db} from '../lib/postgres.js';
import {renameDocumentStorage} from '../lib/client-document-storage-reconcile.js';
import {documentStoragePath} from '../lib/client-document-storage-path.js';
import {storageLifecycleReady,enqueueDocumentStorageMaintenance,queueDocumentCleanup,sweepDocumentStorage,documentCleanupSummary} from '../lib/client-document-storage-maintenance.js';
import {privateStorageConfig,copyStoredDocument,inspectStoredDocument,removeStoredDocument} from '../lib/client-document-storage-provider.js';
async function main(){
 const args=process.argv.slice(2),allowed=['--confirm-database','--client','--actor','--apply','--rename','--allow-remote','--discard-upload'];
 for(let i=0;i<args.length;i++){if(!allowed.includes(args[i]))throw Error('Invalid option');if(['--confirm-database','--client','--actor','--discard-upload'].includes(args[i]))i++;}
 const value=key=>args.includes(key)?args[args.indexOf(key)+1]:null,name=value('--confirm-database'),client=value('--client'),actor=value('--actor'),apply=args.includes('--apply'),rename=args.includes('--rename'),url=new URL(process.env.DATABASE_URL||'');
 if(!name||decodeURIComponent(url.pathname.slice(1))!==name||!/^[1-9][0-9]*$/.test(client||'')||apply&&!/^[1-9][0-9]*$/.test(actor||'')||!['127.0.0.1','localhost','[::1]'].includes(url.hostname)&&!args.includes('--allow-remote'))throw Error('Confirm the intended database, client and acting administrator privately.');
 const config=privateStorageConfig();if(!await storageLifecycleReady(db))throw Error('Apply document lifecycle migration first');
 const transaction=async work=>{const connection=await db.connect();try{await connection.query('BEGIN');await connection.query("SET LOCAL lock_timeout='3s'");if(apply){const ok=await connection.query('SELECT 1 FROM portal_admins a WHERE user_id=$1 AND is_active AND NOT EXISTS(SELECT 1 FROM portal_internal_users i WHERE i.user_id=a.user_id) FOR SHARE OF a',[actor]);if(!ok.rowCount)throw Error('Approved acting administrator required');}await connection.query("SELECT pg_advisory_xact_lock(hashtextextended('document-delivery:'||$1,202))",[client]);const result=await work(connection);await connection.query('COMMIT');return result;}catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}};
 const discard=args.flatMap((v,i)=>v==='--discard-upload'?[args[i+1]]:[]);if(discard.some(id=>!/^[-a-f0-9]{36}$/i.test(id)))throw Error('Confirm exact abandoned upload IDs');
 const before=(await db.query('SELECT id,client_id,filename,object_path,state,archived_at,storage_origin,bucket FROM portal_client_document_objects WHERE client_id=$1 ORDER BY id',[client])).rows;
 if(before.some(row=>row.storage_origin!==config.origin||row.bucket!==config.bucket))throw Error('Stored configuration does not match approved destination');
 const candidates=before.filter(row=>!row.archived_at&&row.state==='ready'&&row.object_path!==documentStoragePath(client,row.id,row.filename));
 const report={dryRun:!apply,clientId:client,activeUploads:before.filter(row=>!row.archived_at&&row.state==='ready').length,archivedUploads:before.filter(row=>row.archived_at).length,pendingUploads:before.filter(row=>!row.archived_at&&row.state==='pending').length,plannedRenames:rename?candidates.length:0,renamed:0,plannedAbandonedUploads:discard.length};
 if(apply){
  await transaction(connection=>enqueueDocumentStorageMaintenance(connection,config,client,true));
  for(const id of discard){await transaction(async connection=>{const row=(await connection.query("SELECT * FROM portal_client_document_objects WHERE id=$1 AND client_id=$2 AND state='pending' AND archived_at IS NULL FOR UPDATE",[id,client])).rows[0];if(!row)return;await connection.query("UPDATE portal_client_document_objects SET state='rejected',archived_at=now(),updated_at=now(),revision=revision+1 WHERE id=$1",[id]);await queueDocumentCleanup(connection,row);});}
  for(const candidate of rename?candidates:[]){if(await renameDocumentStorage({transaction,client,id:candidate.id,actor,config,copy:copyStoredDocument,inspect:inspectStoredDocument}))report.renamed++;}
  report.cleanup=await sweepDocumentStorage({transaction,config,remove:removeStoredDocument,client,limit:20,retry:true});
  report.legacyBytesCleared=(await transaction(connection=>connection.query("UPDATE portal_client_document_files SET content=''::bytea WHERE client_id=$1 AND archived_at IS NOT NULL AND octet_length(content)>0 RETURNING id",[client]))).rowCount;
 }
 report.storageCleanup=await documentCleanupSummary(db,client);console.log(JSON.stringify(report));
}
main().catch(error=>{console.error('Document storage reconciliation stopped',{code:/^[a-z_0-9]{2,60}$/i.test(error.code||'')?error.code:'review_required'});process.exitCode=1;}).finally(()=>db.end());
