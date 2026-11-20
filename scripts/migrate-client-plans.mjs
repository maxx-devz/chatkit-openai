import {readFile} from 'node:fs/promises';import {createHash} from 'node:crypto';import pg from 'pg';
const args=process.argv.slice(2),option=name=>args[args.indexOf(name)+1];
const url=process.env.CLIENT_PLANS_MIGRATION_DATABASE_URL||process.env.DATABASE_URL;
let db;
try{
 if(!url||!args.includes('--confirm-database')||!args.includes('--app-role'))throw Error('Provide the approved database name and runtime role.');
 const host=new URL(url).hostname;if(!['localhost','127.0.0.1','[::1]'].includes(host)&&!args.includes('--allow-remote'))throw Error('Remote migration requires explicit target approval.');
 const role=option('--app-role');if(!/^[a-z_][a-z0-9_]{0,62}$/.test(role))throw Error('Invalid runtime role.');
 db=new pg.Client({connectionString:url,connectionTimeoutMillis:8000});await db.connect();
 if((await db.query('SELECT current_database() AS name')).rows[0].name!==option('--confirm-database'))throw Error('Wrong migration database.');
 const schema=await readFile(new URL('../database/client-plans.sql',import.meta.url),'utf8'),hash=createHash('sha256').update(schema).digest('hex');
 await db.query('BEGIN');await db.query("SET LOCAL lock_timeout='3s'");
 await db.query('CREATE TABLE IF NOT EXISTS portal_client_plan_schema_versions(version INTEGER PRIMARY KEY,checksum TEXT NOT NULL,applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW())');
 const previous=(await db.query('SELECT checksum FROM portal_client_plan_schema_versions WHERE version=1')).rows[0];
 if(previous&&previous.checksum!==hash)throw Error('Applied migration checksum differs; use a new version.');
 await db.query(schema);
 for(const [table,rights] of [['portal_client_plans','SELECT,INSERT,UPDATE'],['portal_client_plan_months','SELECT,INSERT'],['portal_client_plan_requests','SELECT,INSERT,UPDATE'],['portal_client_plan_topups','SELECT,INSERT'],['portal_client_plan_runs','SELECT,INSERT,UPDATE'],['portal_client_plan_audit','SELECT,INSERT'],['portal_client_plan_operations','SELECT,INSERT']]){
  await db.query(`REVOKE ALL ON ${table} FROM "${role}"`);await db.query(`GRANT ${rights} ON ${table} TO "${role}"`);
 }
 await db.query(`GRANT SELECT ON portal_client_plan_balances TO "${role}"`);await db.query(`GRANT USAGE,SELECT ON SEQUENCE portal_client_plan_audit_id_seq TO "${role}"`);
 await db.query('INSERT INTO portal_client_plan_schema_versions(version,checksum) VALUES(1,$1) ON CONFLICT DO NOTHING',[hash]);
 const privateGrants=await readFile(new URL('../database/client-plans-private-grants.sql',import.meta.url),'utf8');
 const privateHash=createHash('sha256').update(privateGrants).digest('hex');
 const second=(await db.query('SELECT checksum FROM portal_client_plan_schema_versions WHERE version=2')).rows[0];
 if(second&&second.checksum!==privateHash)throw Error('Applied grants checksum differs; use a new version.');
 await db.query(privateGrants);
 await db.query('INSERT INTO portal_client_plan_schema_versions(version,checksum) VALUES(2,$1) ON CONFLICT DO NOTHING',[privateHash]);
 await db.query(args.includes('--dry-run')?'ROLLBACK':'COMMIT');
 console.log('PASS: client-plan schema and scoped runtime grants '+(args.includes('--dry-run')?'previewed and rolled back.':'applied. No client plan, payment or historical record changed.'));
}catch(error){await db?.query('ROLLBACK').catch(()=>{});console.error('Client-plan migration failed:',error.code||error.message);process.exitCode=1;}finally{await db?.end().catch(()=>{});}
