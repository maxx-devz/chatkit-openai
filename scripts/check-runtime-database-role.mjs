import pg from 'pg';
import {approvedDatabaseTarget,safeDatabaseCode} from './agency-platform-config.mjs';
import {RUNTIME_ROLE_SQL} from '../lib/runtime-database-role.js';

async function main() {
  const [flag,name,...rest]=process.argv.slice(2);
  if(flag!=='--confirm-database'||rest.length)throw Error('Confirm the approved database name.');
  const connectionString=approvedDatabaseTarget(process.env.DATABASE_URL,name);
  const db=new pg.Client({connectionString,connectionTimeoutMillis:8000,query_timeout:10000});
  try {
    await db.connect();
    const {rows:[facts]}=await db.query(RUNTIME_ROLE_SQL);
    console.log(JSON.stringify(facts)); // Catalog booleans only; no target/role/secret.
    if(!facts.adopted||!facts.allowed)process.exitCode=1;
  } finally {await db.end();}
}
main().catch(error=>{console.error('Runtime database audit failed',safeDatabaseCode(error));process.exitCode=1;});
