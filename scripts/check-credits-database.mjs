// Actual PostgreSQL fixtures. Every application table below is TEMP and drops
// in one rolled-back transaction, including when DATABASE_URL uses a pooler.
// No live settings, allowances or costs are changed.
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import pg from "pg";
import {readClientCredits,saveCreditPricing,allocateReportingCredits,CreditsConflict} from "../lib/credits-repository.js";
import {spendingPeriod} from "../lib/ai-spending-repository.js";
import {readCreditPricingAdmin} from "../lib/credits-repository.js";
import {readAdminCreditReport} from "../lib/admin-credit-report.js";
const db=new pg.Client({connectionString:process.env.DATABASE_URL,connectionTimeoutMillis:8000});
try {
  await db.connect();
  await db.query("BEGIN");
  await db.query("SET LOCAL search_path=pg_temp");
  await db.query("CREATE TEMP TABLE portal_users(id BIGINT PRIMARY KEY)");
  await db.query("CREATE TEMP TABLE portal_clients(id BIGINT PRIMARY KEY,display_name TEXT)");
  await db.query("CREATE TEMP TABLE portal_ai_usage_events(request_id UUID,client_id BIGINT,action TEXT,started_at TIMESTAMPTZ)");
  for(const file of ["ai-cost-schema.sql","ai-credits-schema.sql"]) {
    const schema=(await readFile(new URL("../database/"+file,import.meta.url),"utf8"))
      .replaceAll("CREATE TABLE IF NOT EXISTS","CREATE TEMP TABLE IF NOT EXISTS");
    await db.query(schema);
  }
  await db.query("INSERT INTO portal_clients VALUES(1,'Synthetic A'),(2,'Synthetic B')");
  // Repository transactions become savepoints, keeping the outer fixture
  // transaction pinned to one pooled backend until its final rollback.
  const query=(sql,...args)=>db.query(({BEGIN:"SAVEPOINT credit_fixture",COMMIT:"RELEASE SAVEPOINT credit_fixture",ROLLBACK:"ROLLBACK TO SAVEPOINT credit_fixture"})[sql] || sql,...args);
  const pool={query,connect:async()=>({query,release(){}})};
  const period=spendingPeriod().period,key=randomUUID();
  const policy=await saveCreditPricing(pool,{pricingType:"percentage",aocFee:"20",creditsPerUsd:"1000",idempotencyKey:key},"admin-fixture");
  assert.equal((await saveCreditPricing(pool,{pricingType:"percentage",aocFee:"20",creditsPerUsd:"1000",idempotencyKey:key},"admin-fixture")).id,policy.id);
  const allocation={clientId:"1",period,amount:"10000",reason:"Synthetic reporting allowance",idempotencyKey:randomUUID()};
  assert.equal((await allocateReportingCredits(pool,allocation,"admin-fixture")).duplicate,false);
  assert.equal((await allocateReportingCredits(pool,allocation,"admin-fixture")).duplicate,true);
  await assert.rejects(allocateReportingCredits(pool,{...allocation,amount:"9000"},"admin-fixture"),CreditsConflict);
  await assert.rejects(allocateReportingCredits(pool,{...allocation,reason:"Different reason"},"admin-fixture"),CreditsConflict);
  assert.equal((await db.query("SELECT reason FROM portal_ai_credit_entries WHERE client_id=1 AND kind='allocation'")).rows[0].reason,allocation.reason);
  async function event(client,amount,basis="estimated") {
    const request=randomUUID();
    await db.query(`INSERT INTO portal_ai_cost_events(event_key,request_id,client_id,provider,model,kind,status,basis,amount_usd,
      input_tokens,output_tokens,cached_tokens,reason,occurred_at)
      VALUES($1,$2,$3,'openai','fixture-model','chat','succeeded',$4,$5,1000,50,200,'fixture',NOW())`,[request+":0",request,client,basis,amount]);
  }
  await event(1,"0.25");await event(1,"0.75");
  let report=await readClientCredits(pool,"1",{period});
  assert.equal(Number(report.creditsUsed),1200);assert.equal(Number(report.availableCredits),8800);
  assert.equal(Number(report.aocFeeUsd),0.2);assert.equal(Number(report.inputTokens),2000);
  await readClientCredits(pool,"1",{period});
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM portal_ai_credit_entries WHERE client_id=1")).rows[0].n),3);
  // A new version cannot reprice a period that has already been opened.
  const next=await saveCreditPricing(pool,{pricingType:"fixed",aocFee:"5",creditsPerUsd:"2000",expectedVersion:policy.id,idempotencyKey:randomUUID()},"admin-fixture");
  assert.ok(next.effectivePeriod>period);
  const timeline=await readCreditPricingAdmin(pool);assert.equal(timeline.current.id,policy.id);assert.equal(timeline.scheduled[0].id,next.id);assert.equal(timeline.reasonsReady,true);
  assert.equal((await readClientCredits(pool,"1",{period})).pricing.id,policy.id);
  await assert.rejects(saveCreditPricing(pool,{pricingType:"percentage",aocFee:"25",creditsPerUsd:"1000",effectivePeriod:period,expectedVersion:next.id,idempotencyKey:randomUUID()},"admin-fixture"),CreditsConflict);
  // Seed a separate fixed-fee policy for another synthetic client's unopened period.
  await db.query(`INSERT INTO portal_ai_credit_pricing
    (pricing_type,aoc_fee,credits_per_usd,effective_period,created_by,request_key)
    VALUES('fixed',2,1000,$1,'fixture',$2)`,[period,randomUUID()]);
  await event(2,"0.5");await event(2,"0.25");
  const adminReport=await readAdminCreditReport(pool,"2",period);
  assert.equal(adminReport.needsPreparation,true);assert.equal(adminReport.availableCredits,null);
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM portal_ai_credit_entries WHERE client_id=2")).rows[0].n),0,"Admin review must not create fees or usage entries");
  report=await readClientCredits(pool,"2",{period});
  assert.equal(Number(report.creditsUsed),2750);assert.equal(Number(report.aocFeeUsd),2);
  assert.equal(report.availableCredits,null,"No invented opening allowance");
  await readClientCredits(pool,"2",{period});
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM portal_ai_credit_entries WHERE client_id=2 AND kind='fixed_fee'")).rows[0].n),1);
  assert.equal(Number((await readClientCredits(pool,"1",{period})).apiCostUsd),1,"Other tenant costs do not leak");
  // A committed cost arriving between reconciliation and the aggregate read
  // must not leave the previous available balance looking confirmed.
  let injectPending=true;
  const racingPool={...pool,query:async(sql,...args)=>{
    if(injectPending && sql.includes("AS tracking_started")) {injectPending=false;await event(1,"0.01");}
    return pool.query(sql,...args);
  }};
  report=await readClientCredits(racingPool,"1",{period});
  assert.equal(report.pendingUsageEvents,1);assert.equal(report.availableCredits,null);
  report=await readClientCredits(pool,"1",{period});
  assert.equal(report.pendingUsageEvents,0);assert.equal(Number(report.availableCredits),8788);
  await event(1,null,"unknown");
  report=await readClientCredits(pool,"1",{period});
  assert.equal(report.availableCredits,null);assert.equal(report.totalClientCostUsd,null);
  assert.equal(report.incomplete,true);assert.equal(report.unpricedEvents,1);
  assert.ok(report.transactions.some(row=>row.credits===null));
  assert.ok(!JSON.stringify(report).includes(allocation.reason),"Internal adjustment reasons never appear in client reports");
  assert.equal(report.pricingExample.creditsUsed,"1200");
  assert.ok(report.months.some(row=>row.period===period && Number(row.unpriced)>0));
  assert.ok(report.unpricedBreakdown.some(row=>row.reason==="fixture"));
  // Stable transaction ordering and pagination while new activity is added.
  await db.query("INSERT INTO portal_clients VALUES(3,'Synthetic pagination')");
  await db.query(`INSERT INTO portal_ai_credit_entries(entry_key,client_id,period,kind,credits,basis,occurred_at)
    SELECT fixture.key,3,$1,'allocation',fixture.ordinal,'manual',NOW()
    FROM unnest($2::text[]) WITH ORDINALITY AS fixture(key,ordinal)`,[period,Array.from({length:51},()=>randomUUID())]);
  const first=await readClientCredits(pool,"3",{period});
  assert.equal(first.transactions.length,50);assert.equal(first.hasMoreTransactions,true);
  const repeated=await readClientCredits(pool,"3",{period,asOf:first.transactionAsOf});
  assert.deepEqual(repeated.transactions,first.transactions);
  // A subsequent entry is outside the earlier snapshot, even with old activity time.
  await db.query(`INSERT INTO portal_ai_credit_entries(entry_key,client_id,period,kind,credits,basis,occurred_at,recorded_at)
    VALUES('future-snapshot-fixture',3,$1,'allocation',99,'manual',NOW(),$2::timestamptz+INTERVAL '1 second')`,[period,first.transactionAsOf]);
  const second=await readClientCredits(pool,"3",{period,offset:50,asOf:first.transactionAsOf});
  assert.equal(second.transactions.length,2);assert.equal(second.hasMoreTransactions,false);
  assert.ok(!second.transactions.some(row=>Number(row.credits)===99));
  const before=Number((await db.query("SELECT COUNT(*) AS n FROM portal_ai_credit_entries WHERE client_id=2")).rows[0].n);
  await db.query("DELETE FROM portal_clients WHERE id=2");
  assert.equal(Number((await db.query("SELECT COUNT(*) AS n FROM portal_ai_credit_entries WHERE client_id IS NULL")).rows[0].n),before);
  console.log("PASS real PostgreSQL: exact pricing, fixed-fee-once, duplicate events/adjustments, immutable periods, unknown costs, tenant isolation and archived history. TEMP fixtures only.");
} catch(error) {
  console.error("Credits database fixture failed",{name:error.name,code:error.code,message:error.code?"Database operation failed":error.message});
  process.exitCode=1;
} finally {await db.query("ROLLBACK").catch(()=>{});await db.end().catch(()=>{});}
