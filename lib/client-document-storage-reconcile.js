import {randomUUID,createHash} from 'node:crypto';
import {documentStoragePath,assertDocumentStoragePath} from './client-document-storage-path.js';
import {queueDocumentCleanup} from './client-document-storage-maintenance.js';
export async function renameDocumentStorage({transaction,client,id,actor,config,copy,inspect}){
 return transaction(async connection=>{
  const row=(await connection.query("SELECT * FROM portal_client_document_objects WHERE id=$1 AND client_id=$2 AND archived_at IS NULL AND state='ready' FOR UPDATE",[id,client])).rows[0];if(!row)return false;
  if(row.storage_origin!==config.origin||row.bucket!==config.bucket)throw Error('Stored connection changed');
  const destination=documentStoragePath(client,row.id,row.filename);assertDocumentStoragePath(client,row.id,row.object_path);if(destination===row.object_path)return false;
  await copy(row.object_path,destination);const checked=await inspect(destination,row.filename,Number(row.size_bytes));if(checked.contentHash!==row.content_hash)throw Error('Renamed copy does not match verified content');
  await connection.query('UPDATE portal_client_document_objects SET object_path=$3 WHERE id=$1 AND client_id=$2',[row.id,client,destination]);await queueDocumentCleanup(connection,row);
  const result={id:row.id,filename:row.filename,storageRenamed:true};await connection.query("INSERT INTO portal_client_document_object_audit(file_id,client_id,actor_id,operation,digest,action,result) VALUES($1,$2,$3,$4,$5,'storage_rename',$6::jsonb)",[row.id,client,actor,randomUUID(),createHash('sha256').update(JSON.stringify(result)).digest('hex'),JSON.stringify(result)]);return true;
 });
}
