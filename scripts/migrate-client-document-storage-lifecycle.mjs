import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function main(){
 const [flag,name,roleFlag,role,...options]=process.argv.slice(2);
 if(flag!=='--confirm-database'||roleFlag!=='--app-role'||!/^[a-z][a-z0-9_]{1,62}$/.test(role||'')||options.some(v=>!['--allow-remote','--supabase-policy'].includes(v)))throw Error('Confirm the approved database and ordinary app role.');
 const u=new URL(process.env.CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL||'');
 if(!['postgres:','postgresql:'].includes(u.protocol)||decodeURIComponent(u.pathname.slice(1))!==name||!['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&!options.includes('--allow-remote'))throw Error('Use the explicitly approved target.');
 const sql=await readFile(new URL('../database/client-document-storage-lifecycle.sql',import.meta.url),'utf8'),hash=createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex');
 const db=new pg.Client({connectionString:u.href,connectionTimeoutMillis:10000});
 try{await db.connect();await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");await db.query('SELECT pg_advisory_xact_lock(734901,204)');
 if((await db.query('SELECT current_database() name')).rows[0].name!==name||! (await db.query("SELECT 1 FROM portal_client_document_schema WHERE version='004_private_object_storage'")).rowCount)throw Error('Apply existing document-file setup on the approved target first.');
 if(['anon','authenticated','postgres','service_role'].includes(role)||!(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls',[role])).rowCount)throw Error('Require the ordinary app role.');
 if((await db.query("SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relname IN('portal_clients','portal_users') AND r.rolname=$1",[role])).rowCount)throw Error('Runtime must not own portal tables.');
 const prior=(await db.query("SELECT checksum FROM portal_client_document_schema WHERE version='005_storage_lifecycle'")).rows[0];if(prior&&prior.checksum!==hash)throw Error('Migration checksum changed');
 if(!prior){await db.query(sql);await db.query("INSERT INTO portal_client_document_schema(version,checksum) VALUES('005_storage_lifecycle',$1)",[hash]);}
 await db.query(`GRANT SELECT,INSERT,UPDATE ON portal_client_document_storage_cleanup TO "${role}"`);
 await db.query(`GRANT USAGE,SELECT ON SEQUENCE portal_client_document_storage_cleanup_id_seq TO "${role}"`);
 await db.query('COMMIT');console.log('Document Storage cleanup receipts ready. No Storage objects deleted or renamed.');
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{await db.end();}
}
main().catch(error=>{console.error('Document Storage migration stopped',{code:/^[A-Z0-9_]{2,40}$/.test(error.code||'')?error.code:'setup_required'});process.exitCode=1;});
