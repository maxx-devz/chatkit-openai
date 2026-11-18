// Controlled PostgreSQL evidence only. One pinned transaction and pg_temp search
// path; the final rollback removes every fixture. No live settings are changed.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import pg from "pg";
import {readAdminClientActivity} from "../lib/admin-client-activity.js";
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:8000});
try {
  await db.connect();await db.query("BEGIN");await db.query("SET LOCAL search_path=pg_temp");
  await db.query(`CREATE TEMP TABLE portal_clients(id BIGINT PRIMARY KEY,slug TEXT,portal_enabled BOOLEAN,ai_enabled BOOLEAN,monthly_prompt_limit INTEGER);
    CREATE TEMP TABLE portal_memberships(client_id BIGINT,user_id BIGINT);
    CREATE TEMP TABLE portal_chatkit_threads(client_id BIGINT,user_id BIGINT,id TEXT,created_at TIMESTAMPTZ);
    CREATE TEMP TABLE portal_ai_usage_events(client_id BIGINT,started_at TIMESTAMPTZ,finished_at TIMESTAMPTZ);
    CREATE TEMP TABLE portal_ai_usage_monthly(client_id BIGINT,period_start DATE,requests_used INTEGER,updated_at TIMESTAMPTZ,PRIMARY KEY(client_id,period_start));
    CREATE TEMP TABLE portal_audit_events(audience TEXT,client_id BIGINT,actor_user_id TEXT,action TEXT,target_type TEXT,target_id TEXT);
    CREATE TEMP TABLE portal_ai_cost_events(event_key TEXT);CREATE TEMP TABLE portal_ai_credit_entries(entry_key TEXT);
    INSERT INTO portal_clients VALUES(1,'alpha',true,true,2),(2,'beta',true,true,1);
    INSERT INTO portal_memberships VALUES(1,11),(2,21);
    INSERT INTO portal_chatkit_threads VALUES(1,11,'thread-a','2026-11-01'),(1,12,'thread-b','2026-11-02'),(2,21,'thread-c','2026-11-10');
    INSERT INTO portal_ai_usage_events VALUES(1,'2026-11-15','2026-11-15T01:00:00Z');
    INSERT INTO portal_ai_cost_events VALUES('preserve-cost');INSERT INTO portal_ai_credit_entries VALUES('preserve-credit');`);
  const activity=await readAdminClientActivity(db);
  assert.equal(activity.get('1').conversations,2);assert.equal(activity.get('2').conversations,1);
  assert.equal(activity.get('1').activity.toISOString(),'2026-11-15T01:00:00.000Z');
  assert.equal(activity.get('2').activity.toISOString(),'2026-11-10T00:00:00.000Z');
  const app=await readFile(new URL('../chatkit_backend/app.py',import.meta.url),'utf8');
  const sql=app.match(/async def load_client\(db, envelope\):[\s\S]*?execute\("""([\s\S]*?)"""/)[1];
  let index=0;const access=sql.replace(/%s/g,()=>'$'+(++index));
  await db.query("INSERT INTO portal_ai_usage_monthly VALUES(1,CURRENT_DATE,9999,NOW())");
  for(let n=0;n<3;n++)assert.equal((await db.query(access,[1,11])).rowCount,1,'Legacy request counts do not block authorized clients');
  assert.equal((await db.query(access,[1,21])).rowCount,0,'Other client membership cannot cross scope');
  await db.query("UPDATE portal_clients SET ai_enabled=false WHERE id=2");
  assert.equal((await db.query(access,[2,21])).rowCount,0,'AI-disabled client remains denied');
  await db.query("UPDATE portal_clients SET portal_enabled=false WHERE id=1");
  assert.equal((await db.query(access,[1,11])).rowCount,0,'Disabled portal remains denied');
  console.log('PASS TEMP PostgreSQL: scoped conversation counts, activity, uncapped authorized access and disabled access. Rolled back.');
}catch(error){console.error('Admin readiness database fixtures failed',{code:error.code || error.name,message:error.code?'Database operation failed':error.message});process.exitCode=1;}
finally{await db.query('ROLLBACK').catch(()=>{});await db.end().catch(()=>{});}
