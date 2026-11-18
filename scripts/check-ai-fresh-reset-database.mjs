// TEMP PostgreSQL fixtures only; every record and schema change is rolled back.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import {readClientCredits} from '../lib/credits-repository.js';
import {previewAiUsageClear,clearAiUsageHistory} from '../lib/ai-usage-clear-repository.js';
import {verifyUsageClearPreview} from '../lib/ai-usage-clear-policy.js';
import {readClientSpending,spendingPeriod} from '../lib/ai-spending-repository.js';
import {readUsage} from '../lib/usage-repository.js';
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:8000});
const secret='synthetic-only-at-least-32-characters-reset';
try {
  await db.connect();await db.query('BEGIN');await db.query('SET LOCAL search_path=pg_temp');
  await db.query("SET LOCAL statement_timeout='20s'");
  await db.query(`CREATE TEMP TABLE portal_users(id BIGINT PRIMARY KEY);
    CREATE TEMP TABLE portal_clients(id BIGINT PRIMARY KEY,slug TEXT,display_name TEXT,portal_enabled BOOLEAN,ai_enabled BOOLEAN);
    CREATE TEMP TABLE portal_ai_usage_events(request_id UUID PRIMARY KEY,client_id BIGINT,action TEXT,status TEXT,input_tokens BIGINT,output_tokens BIGINT,total_tokens BIGINT,started_at TIMESTAMPTZ,finished_at TIMESTAMPTZ);
    CREATE TEMP TABLE portal_audit_events(id BIGSERIAL PRIMARY KEY,audience TEXT,client_id BIGINT,actor_user_id BIGINT,action TEXT,target_type TEXT,target_id TEXT);
    CREATE TEMP TABLE portal_chatkit_threads(id TEXT);
    CREATE TEMP TABLE portal_ai_provider_status(credential_hash TEXT,code TEXT,model TEXT,observed_at TIMESTAMPTZ);
    INSERT INTO portal_users VALUES(9);
    INSERT INTO portal_clients VALUES(1,'alpha','Synthetic Golfbrands',true,true),(2,'beta','Other client',true,true);
    INSERT INTO portal_chatkit_threads VALUES('preserve-conversation');`);
  for(const file of ['ai-cost-schema.sql','ai-credits-schema.sql','ai-usage-controls.sql']) {
    const sql=(await readFile(new URL('../database/'+file,import.meta.url),'utf8')).replace(/^BEGIN;|^COMMIT;/gm,'')
      .replaceAll('CREATE TABLE IF NOT EXISTS','CREATE TEMP TABLE IF NOT EXISTS');
    await db.query(sql);
  }
  for(const table of ['portal_clients','portal_ai_usage_events','portal_ai_cost_events','portal_ai_credit_entries','portal_ai_usage_resets'])
    assert.equal((await db.query('SELECT relnamespace=pg_my_temp_schema() AS temp FROM pg_class WHERE oid=$1::regclass',[table])).rows[0].temp,true);
  const query=(sql,...args)=>db.query(({BEGIN:'SAVEPOINT fixture_credit',COMMIT:'RELEASE SAVEPOINT fixture_credit',ROLLBACK:'ROLLBACK TO SAVEPOINT fixture_credit'})[sql] || sql,...args);
  const pool={query,connect:async()=>({query,release(){}})};
  const range=spendingPeriod(),period=range.period;
  const past=new Date(range.start);past.setUTCMonth(past.getUTCMonth()-1);
  const oldPeriod=past.toISOString().slice(0,7);
  await db.query(`INSERT INTO portal_ai_credit_pricing(pricing_type,aoc_fee,credits_per_usd,effective_period,created_by,request_key)
    VALUES('percentage',40,1000,$1,'fixture',$2),('fixed',2,1000,$1,'fixture',$3)`,[oldPeriod,randomUUID(),randomUUID()]);
  await db.query("INSERT INTO portal_ai_credit_periods VALUES(1,$1,1,NOW()),(2,$1,2,NOW())",[period]);
  await db.query(`INSERT INTO portal_ai_credit_entries(entry_key,client_id,period,kind,credits,basis,occurred_at)
    VALUES('alpha-allowance',1,$1,'allocation',600,'manual',NOW()),('beta-allowance',2,$1,'allocation',10000,'manual',NOW())`,[period]);
  async function event(client,amount,{at=new Date(Date.now()-1000),recordedAt=new Date(Date.now()-500),withCost=true}={}) {
    const request=randomUUID();
    await db.query(`INSERT INTO portal_ai_usage_events VALUES($1,$2,'client_ai.reply','succeeded',100,20,120,$3,$4,NULL,NULL,NULL)`,[request,client,at,recordedAt]);
    if(withCost)await db.query(`INSERT INTO portal_ai_cost_events(event_key,request_id,client_id,provider,model,kind,status,basis,amount_usd,
      input_tokens,output_tokens,cached_tokens,reason,occurred_at,recorded_at)
      VALUES($1,$2,$3,'openai','fixture','chat','succeeded',$4,$5,100,20,0,'fixture',$6,$7)`,
      [request,request,client,amount===null?'unknown':'estimated',amount,at,recordedAt]);
    return request;
  }
  await event(1,'0.00580029');await event(1,null);await event(1,null,{withCost:false});
  await event(1,'0.05',{at:past,recordedAt:past});
  await event(2,'0.5');
  let alpha=await readClientCredits(pool,'1',{period});
  assert.equal(alpha.availableCredits,null);assert.equal(alpha.incomplete,true);
  assert.equal(Number(alpha.creditsUsed),8.120406);
  const betaBefore=await readClientCredits(pool,'2',{period});assert.equal(Number(betaBefore.creditsUsed),2500);
  // Previously hidden activity must still be included by a full accounting reset.
  await db.query("UPDATE portal_ai_usage_events SET cleared_at=NOW() WHERE client_id=1");
  const preview=await previewAiUsageClear(db,{scope:'client',clientId:'1',period:'all'},'9',secret);
  assert.equal(preview.clients,1);assert.equal(preview.requests,4);assert.equal(preview.unpriced,1);
  const plan=verifyUsageClearPreview(preview.token,'9',secret);
  const result=await clearAiUsageHistory(db,plan);assert.equal(result.clientsReset,1);
  const retry=await clearAiUsageHistory(db,plan);assert.equal(retry.clientsReset,0);assert.equal(retry.costsCleared,0);
  alpha=await readClientCredits(pool,'1',{period});
  assert.equal(Number(alpha.availableCredits),600,'600 assigned credits are fully visible after reset');
  assert.equal(Number(alpha.creditsUsed),0);assert.equal(Number(alpha.apiCostUsd),0);
  assert.equal(Number(alpha.aocFeeUsd),0);assert.equal(Number(alpha.totalClientCostUsd),0);
  assert.equal(alpha.incomplete,false);assert.equal(alpha.partialHistory,false);assert.ok(alpha.usageResetAt);
  assert.equal(alpha.missingTurns,0);assert.equal(alpha.unpricedEvents,0);assert.equal(alpha.pendingUsageEvents,0);
  assert.equal(alpha.inputTokens,'0');assert.equal(alpha.outputTokens,'0');assert.equal(alpha.cachedTokens,'0');
  assert.equal(alpha.history.length,0);assert.equal(alpha.months.length,0);
  assert.deepEqual(alpha.transactions.map(row=>row.kind),['allocation']);
  assert.equal(alpha.pricing.id,'1');assert.equal((await db.query('SELECT * FROM portal_chatkit_threads')).rowCount,1);
  assert.equal(Number((await readClientCredits(pool,'2',{period})).creditsUsed),2500,'Other tenant stays unchanged');
  assert.equal((await db.query('SELECT * FROM portal_ai_cost_events')).rowCount,4,'Raw accounting evidence is retained');
  // Late completion of a request started before reset must never re-deduct credits.
  await event(1,'0.1',{at:new Date(Date.parse(plan.before)-1),recordedAt:new Date(Date.parse(plan.before)+100)});
  alpha=await readClientCredits(pool,'1',{period});assert.equal(Number(alpha.availableCredits),600);
  assert.equal((await readUsage(db)).clients.find(row=>row.id==='1').used,0);
  assert.equal((await readClientSpending(db,period)).clients.find(row=>row.slug==='alpha').events,0);
  // New post-reset work counts using the original 40% pricing.
  await event(1,'0.01',{at:new Date(Date.parse(plan.before)+200),recordedAt:new Date(Date.parse(plan.before)+300)});
  alpha=await readClientCredits(pool,'1',{period});
  assert.equal(Number(alpha.availableCredits),586);assert.equal(Number(alpha.creditsUsed),14);
  assert.equal(alpha.history.length,1);assert.ok(alpha.transactions.some(row=>row.kind==='usage'));
  // Reset this month's fixed fee once; reconciling it cannot recreate the deduction.
  const betaPreview=await previewAiUsageClear(db,{scope:'client',clientId:'2',period},'9',secret);
  await clearAiUsageHistory(db,verifyUsageClearPreview(betaPreview.token,'9',secret));
  let beta=await readClientCredits(pool,'2',{period});assert.equal(Number(beta.availableCredits),10000);assert.equal(Number(beta.creditsUsed),0);
  await readClientCredits(pool,'2',{period});
  assert.equal((await db.query("SELECT * FROM portal_ai_credit_entries WHERE client_id=2 AND kind='fixed_fee'")).rowCount,1);
  // A new unknown charge remains unknown; no numeric balance is fabricated.
  await event(1,null,{at:new Date(Date.parse(plan.before)+400),recordedAt:new Date(Date.parse(plan.before)+500)});
  alpha=await readClientCredits(pool,'1',{period});assert.equal(alpha.availableCredits,null);assert.equal(alpha.unpricedEvents,1);
  console.log('PASS TEMP PostgreSQL: unknown -> 600 visible credits, zero token/USD/fees/history, 586 after new usage, late completions ignored, fixed-fee retry safety, preserved pricing/allowances/conversations and tenant isolation.');
} catch(error){console.error('Fresh AI usage reset fixture failed',{code:error.code || error.name,message:error.message});process.exitCode=1;}
finally{await db.query('ROLLBACK').catch(()=>{});await db.end().catch(()=>{});}
