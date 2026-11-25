import 'server-only';
import {databasePool as db} from './database.js';
import {privateStorageConfig,removeStoredDocument} from './client-document-storage-provider.js';
import {storageLifecycleReady,enqueueDocumentStorageMaintenance,sweepDocumentStorage} from './client-document-storage-maintenance.js';
export async function runDocumentStorageCleanup(){
 if(!await storageLifecycleReady(db))return {setupRequired:true,removed:0};
 const config=privateStorageConfig();
 const transaction=async work=>{const connection=await db.connect();try{await connection.query('BEGIN');await connection.query("SET LOCAL lock_timeout='3s'");const value=await work(connection);await connection.query('COMMIT');return value;}catch(error){await connection.query('ROLLBACK');throw error;}finally{connection.release();}};
 await transaction(connection=>enqueueDocumentStorageMaintenance(connection,config));
 return sweepDocumentStorage({transaction,config,remove:removeStoredDocument,limit:3});
}
