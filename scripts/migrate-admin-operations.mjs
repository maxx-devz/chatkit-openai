import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import pg from 'pg';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
let db;
try{
 const url=process.env.ADMIN_AUDIT_MIGRATION_DATABASE_URL||process.env.DATABASE_URL;
 if(!url||!args.includes('--confirm-database')||!args.includes('--app-role'))throw Error('Specify the approved database name and ordinary runtime role.');
 if(!['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname)&&!args.includes('--allow-remote'))throw Error('Remote migration requires explicit approval.');
 const role=option('--app-role');if(!/^[a-z_][a-z0-9_]{0,62}$/.test(role))throw Error('Invalid runtime role.');
 db=new pg.Client({connectionString:url,connectionTimeoutMillis:8000});await db.connect();
 if((await db.query('SELECT current_database() AS name')).rows[0].name!==option('--confirm-database'))throw Error('Wrong migration database.');
 const safety=(await db.query('SELECT rolsuper,rolbypassrls FROM pg_roles WHERE rolname=$1',[role])).rows[0];
 if(!safety||safety.rolsuper||safety.rolbypassrls||(await db.query("SELECT 1 FROM pg_class c JOIN pg_roles r ON r.oid=c.relowner WHERE c.relname='portal_clients' AND r.rolname=$1",[role])).rows.length)throw Error('Use an ordinary, non-owner runtime role.');
 const sql=await readFile(new URL('../database/admin-operation-audit.sql',import.meta.url),'utf8'),hash=createHash('sha256').update(sql).digest('hex');
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");
 await db.query('CREATE TABLE IF NOT EXISTS portal_admin_operation_schema_versions(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 const previous=(await db.query('SELECT checksum FROM portal_admin_operation_schema_versions WHERE version=1')).rows[0];if(previous&&previous.checksum!==hash)throw Error('Migration checksum changed; create a new version.');
 await db.query(sql);
 await db.query(`REVOKE ALL ON portal_admin_operation_audit,portal_admin_operation_schema_versions FROM PUBLIC,"${role}"`);
 await db.query(`REVOKE ALL ON SEQUENCE portal_admin_operation_audit_id_seq FROM PUBLIC,"${role}"`);
 for(const name of ['anon','authenticated'])if((await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[name])).rows.length){
  await db.query(`REVOKE ALL ON portal_admin_operation_audit,portal_admin_operation_schema_versions FROM "${name}"`);
  await db.query(`REVOKE ALL ON SEQUENCE portal_admin_operation_audit_id_seq FROM "${name}"`);
 }
 await db.query(`GRANT SELECT,INSERT ON portal_admin_operation_audit TO "${role}"`);
 await db.query(`GRANT USAGE,SELECT ON SEQUENCE portal_admin_operation_audit_id_seq TO "${role}"`);
 await db.query('INSERT INTO portal_admin_operation_schema_versions(version,checksum) VALUES(1,$1) ON CONFLICT DO NOTHING',[hash]);
 await db.query(args.includes('--dry-run')?'ROLLBACK':'COMMIT');
 console.log('PASS: append-only admin audit migration '+(args.includes('--dry-run')?'previewed without persistent writes.':'applied with private runtime grants.'));
}catch(error){await db?.query('ROLLBACK').catch(()=>{});console.error('Admin audit migration failed:',/^[0-9A-Z_]{5,30}$/.test(error.code||'')?error.code:'Check target, role, schema and checksum. No credentials are printed.');process.exitCode=1;}finally{await db?.end().catch(()=>{});}
