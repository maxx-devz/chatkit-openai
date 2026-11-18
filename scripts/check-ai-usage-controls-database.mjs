// Session-local TEMP fixtures only. No application rows or external APIs are touched.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import pg from 'pg';
import {previewAiUsageClear,clearAiUsageHistory} from '../lib/ai-usage-clear-repository.js';
import {verifyUsageClearPreview} from '../lib/ai-usage-clear-policy.js';
import {readClientSpending} from '../lib/ai-spending-repository.js';
import {readUsage} from '../lib/usage-repository.js';
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:8000});
const secret='synthetic-only-signing-secret-at-least-32',period=new Date().toISOString().slice(0,7);
try {
  await db.connect();await db.query('BEGIN');await db.query('SET LOCAL search_path=pg_temp');
  await db.query("SET LOCAL statement_timeout='15s'");
  await db.query(`CREATE TEMP TABLE portal_users(id BIGINT PRIMARY KEY);
    CREATE TEMP TABLE portal_clients(id BIGINT PRIMARY KEY,slug TEXT,display_name TEXT,portal_enabled BOOLEAN,ai_enabled BOOLEAN);
    CREATE TEMP TABLE portal_ai_usage_events(request_id UUID PRIMARY KEY,client_id BIGINT,actor_user_id BIGINT,action TEXT,status TEXT,
      input_tokens BIGINT,output_tokens BIGINT,total_tokens BIGINT,started_at TIMESTAMPTZ,finished_at TIMESTAMPTZ);
    CREATE TEMP TABLE portal_audit_events(id BIGSERIAL PRIMARY KEY,audience TEXT,client_id BIGINT,actor_user_id BIGINT,action TEXT,target_type TEXT,target_id TEXT);
    CREATE TEMP TABLE portal_ai_cost_state(id INT PRIMARY KEY,started_at TIMESTAMPTZ);
    CREATE TEMP TABLE portal_ai_cost_events(event_key TEXT PRIMARY KEY,request_id UUID,client_id BIGINT,amount_usd NUMERIC(24,12),basis TEXT,reason TEXT,occurred_at TIMESTAMPTZ,recorded_at TIMESTAMPTZ);
    CREATE TEMP TABLE portal_ai_credit_entries(entry_key TEXT PRIMARY KEY,client_id BIGINT,credits NUMERIC,source_event_key TEXT REFERENCES portal_ai_cost_events(event_key));
    CREATE TEMP TABLE portal_chatkit_threads(id TEXT);
    CREATE TEMP TABLE portal_ai_provider_status(credential_hash TEXT,code TEXT,model TEXT,observed_at TIMESTAMPTZ);
    INSERT INTO portal_users VALUES(9);
    INSERT INTO portal_clients VALUES(1,'alpha','Alpha',true,true),(2,'beta','Beta',true,true);
    INSERT INTO portal_ai_cost_state VALUES(1,'2020-01-01');
    INSERT INTO portal_chatkit_threads VALUES('preserve-conversation');`);
  const migration=(await readFile(new URL('../database/ai-usage-controls.sql',import.meta.url),'utf8')).replace(/^BEGIN;|^COMMIT;/gm,'');
  await db.query(migration);await db.query(migration);
  for(const table of ['portal_ai_usage_events','portal_ai_cost_events','portal_audit_events'])assert.equal(
    (await db.query('SELECT relnamespace=pg_my_temp_schema() AS temp FROM pg_class WHERE oid=$1::regclass',[table])).rows[0].temp,true);
  const requests=[];
  async function event(client,action,cost,{late=false,old=false,requestId=randomUUID()}={}) {
    requests.push(requestId);
    await db.query(`INSERT INTO portal_ai_usage_events(request_id,client_id,action,status,input_tokens,output_tokens,total_tokens,started_at,finished_at)
      VALUES($1,$2,$3,'succeeded',100,20,120,$4,$5)`,[requestId,client,action,
      old?period+'-01T00:00:00Z':new Date(),late?new Date(Date.now()+60000):new Date(Date.now()-1000)]);
    if(cost!==undefined) {
      await db.query(`INSERT INTO portal_ai_cost_events VALUES($1,$2,$3,$4,$5,'fixture',$6,$7,NULL,NULL,NULL)`,
        [requestId,requestId,client,cost,cost===null?'unknown':'reported',new Date(),late?new Date(Date.now()+60000):new Date(Date.now()-1000)]);
      await db.query("INSERT INTO portal_ai_credit_entries VALUES($1,$2,-100,$1)",[requestId,client]);
    }
    return requestId;
  }
  await event(1,'client_ai.reply','0.25');await event(1,'client_ai.reply',undefined); // unknown cost coverage must remain in accounting
  await event(2,'client_ai.reply','0.75');await event(null,'admin_ai.reply',undefined);await event(1,'builder.preview',undefined);
  const before=await readClientSpending(db,period);
  assert.equal(before.clients.find(c=>c.slug==='alpha').knownUsd,'0.250000000000');
  assert.equal(before.clients.find(c=>c.slug==='alpha').missingTurns,1);
  const preview=await previewAiUsageClear(db,{scope:'client',clientId:'1',period},'9',secret);
  assert.equal(preview.requests,2);assert.equal(preview.missingCosts,1);assert.equal(preview.costEvents,1);assert.equal(preview.knownUsd,'0.250000000000');
  const plan=verifyUsageClearPreview(preview.token,'9',secret);
  const newer=await event(1,'client_ai.reply','0.10',{late:true});
  const first=await clearAiUsageHistory(db,plan);
  assert.equal(first.cleared,2);assert.equal(first.costsCleared,1);
  const retry=await clearAiUsageHistory(db,plan);assert.equal(retry.cleared,0);assert.equal(retry.costsCleared,0);
  const rows=(await db.query('SELECT request_id,cleared_at FROM portal_ai_usage_events')).rows;
  assert.equal(rows.filter(row=>row.cleared_at).length,2);assert.equal(rows.find(row=>row.request_id===newer).cleared_at,null);
  const after=await readClientSpending(db,period);
  assert.equal(after.clients.find(c=>c.slug==='alpha').knownUsd,'0.100000000000');
  assert.equal(after.clients.find(c=>c.slug==='alpha').missingTurns,0);
  assert.equal(after.clients.find(c=>c.slug==='beta').knownUsd,'0.750000000000');
  assert.equal((await readUsage(db)).clients.find(c=>c.id==='1').used,1);
  assert.equal((await db.query('SELECT * FROM portal_ai_cost_events')).rowCount,3);
  assert.equal((await db.query('SELECT * FROM portal_ai_credit_entries')).rowCount,3);
  assert.equal((await db.query('SELECT * FROM portal_chatkit_threads')).rowCount,1);
  assert.equal((await db.query('SELECT * FROM portal_audit_events')).rowCount,1);
  const adminPreview=await previewAiUsageClear(db,{scope:'admin',period:'all'},'9',secret);
  assert.equal(adminPreview.requests,1);
  const admin=await clearAiUsageHistory(db,verifyUsageClearPreview(adminPreview.token,'9',secret));assert.equal(admin.cleared,1);
  assert.equal((await db.query("SELECT * FROM portal_ai_usage_events WHERE action='builder.preview' AND cleared_at IS NULL")).rowCount,1);
  console.log('PASS TEMP PostgreSQL: scoped AI usage + USD clearing, immutable cutoff, retry safety, audit, migration reruns, preserved conversations and credit accounting. Rolled back.');
} catch(error) {console.error('Usage controls fixture failed',{code:error.code || error.name,message:error.code?'Database operation failed':error.message});process.exitCode=1;}
finally {await db.query('ROLLBACK').catch(()=>{});await db.end().catch(()=>{});}
