import pg from 'pg';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
async function main(){
 const [flag,name,roleFlag,role,...extra]=process.argv.slice(2);
 if(flag!=='--confirm-database'||roleFlag!=='--app-role'||!name||!/^[a-z][a-z0-9_]{1,62}$/.test(role||'')||extra.some(arg=>arg!=='--allow-remote'))throw Error('Provide --confirm-database NAME --app-role ROLE and a private migration URL.');
 const url=new URL(process.env.CLIENT_DOCUMENTS_MIGRATION_DATABASE_URL||'');
 if(!['postgres:','postgresql:'].includes(url.protocol)||decodeURIComponent(url.pathname.slice(1))!==name||!['localhost','127.0.0.1','[::1]'].includes(url.hostname)&&!extra.includes('--allow-remote'))throw Error('Require the confirmed disposable target; a remote migration requires explicit approval and --allow-remote.');
 const sql=await readFile(new URL('../database/client-document-files.sql',import.meta.url),'utf8'),hash=createHash('sha256').update(sql.replace(/\r\n/g,'\n')).digest('hex');
 const db=new pg.Client({connectionString:url.href,connectionTimeoutMillis:8000});
 try{await db.connect();if((await db.query('SELECT current_database() name')).rows[0].name!==name)throw Error('Database mismatch');
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");await db.query('SELECT pg_advisory_xact_lock(734901,203)');
 if(['anon','authenticated','postgres','service_role'].includes(role)||!(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1 AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls',[role])).rowCount)throw Error('Runtime role missing');
 await db.query('CREATE TABLE IF NOT EXISTS portal_client_document_schema(version text PRIMARY KEY,checksum text NOT NULL,applied_at timestamptz NOT NULL DEFAULT now())');
 const applied=(await db.query("SELECT checksum FROM portal_client_document_schema WHERE version='003_private_uploads'")).rows[0];
 if(applied&&applied.checksum!==hash)throw Error('Migration checksum mismatch');
 if(!applied){await db.query(sql);await db.query("INSERT INTO portal_client_document_schema(version,checksum) VALUES('003_private_uploads',$1)",[hash]);}
 await db.query(`GRANT SELECT,INSERT,UPDATE ON portal_client_document_files TO "${role}"`);
 await db.query(`GRANT SELECT,INSERT ON portal_client_document_file_audit TO "${role}"`);
 await db.query(`GRANT USAGE,SELECT ON SEQUENCE portal_client_document_file_audit_id_seq TO "${role}"`);
 await db.query('COMMIT');console.log('Private client-file storage ready. Existing records unchanged.');
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{await db.end();}
}
main().catch(error=>{console.error('Client-file migration stopped',{code:error.code||'setup_error'});process.exitCode=1;});
