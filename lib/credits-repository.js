import {spendingPeriod} from "./ai-spending-repository.js";
import {usageSinceReset,creditSinceReset} from "./ai-usage-reset-sql.js";
import {creditRequestKey,normalizeCreditDecimal,validateCreditAdjustment,validateCreditPricing} from "./credits-pricing.js";
import {previewCreditPricing} from "./credits-pricing.js";
import {creditSnapshot} from "./credits-presentation.js";
import {creditAdjustmentReason,pricingTimeline} from "./admin-credit-pricing.js";

const currentPeriod=()=>new Date().toISOString().slice(0,7);
const policyRecord=row=>row?{id:String(row.id),pricingType:row.pricing_type,aocFee:row.aoc_fee,
  creditsPerUsd:row.credits_per_usd,effectivePeriod:row.effective_period,createdAt:row.created_at}:null;
export class CreditsConflict extends Error {}
async function transaction(pool,run) {
  const db=await pool.connect();
  try {await db.query("BEGIN");const value=await run(db);await db.query("COMMIT");return value;}
  catch(error){await db.query("ROLLBACK").catch(()=>{});throw error;}
  finally{db.release();}
}

export async function readCreditPricingAdmin(db) {
  const versions=(await db.query("SELECT * FROM portal_ai_credit_pricing ORDER BY id DESC LIMIT 30")).rows;
  const current=(await db.query("SELECT * FROM portal_ai_credit_pricing WHERE effective_period<=$1 ORDER BY effective_period DESC,id DESC LIMIT 1",[currentPeriod()])).rows[0];
  const records=versions.map(policyRecord);if(current && !records.some(row=>row.id===String(current.id)))records.push(policyRecord(current));
  const clients=(await db.query("SELECT id,display_name,to_jsonb(c)->>'slug' AS slug FROM portal_clients c ORDER BY display_name")).rows;
  const reasonsReady=(await db.query("SELECT EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='portal_ai_credit_entries'::regclass AND attname='reason' AND NOT attisdropped) AS ready")).rows[0].ready;
  return {mode:"reporting_only",billingPeriod:"UTC calendar month",versions:records,...pricingTimeline(records,currentPeriod()),reasonsReady,
    editorPeriod:versions.length?spendingPeriod().end.slice(0,7):currentPeriod(),
    clients:clients.map(row=>({id:String(row.id),name:row.display_name,slug:row.slug || ""})),currentPeriod:currentPeriod()};
}

export async function saveCreditPricing(pool,input,actorId) {
  const policy=validateCreditPricing(input),key=creditRequestKey(input.idempotencyKey);
  return transaction(pool,async db=>{
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("LOCK TABLE portal_ai_credit_pricing IN SHARE ROW EXCLUSIVE MODE");
    const existing=(await db.query("SELECT * FROM portal_ai_credit_pricing WHERE request_key=$1",[key])).rows[0];
    if(existing) {
      const prior=validateCreditPricing(policyRecord(existing));
      if(JSON.stringify(prior)!==JSON.stringify(policy) || (input.effectivePeriod && input.effectivePeriod!==existing.effective_period))throw new CreditsConflict("This save key was already used for different settings.");
      return policyRecord(existing);
    }
    const latest=(await db.query("SELECT * FROM portal_ai_credit_pricing ORDER BY id DESC LIMIT 1")).rows[0];
    if(String(latest?.id || "")!==String(input.expectedVersion || ""))throw new CreditsConflict("Pricing changed in another session. Reload and review it.");
    // First setup establishes this month's reporting baseline; later changes
    // start next month. Opened periods always keep their original pricing ID.
    const effective=latest?spendingPeriod().end.slice(0,7):currentPeriod();
    if(input.effectivePeriod && input.effectivePeriod!==effective)throw new CreditsConflict("The UTC billing month changed. Reload pricing and review the effective period before saving.");
    return policyRecord((await db.query(`INSERT INTO portal_ai_credit_pricing
      (pricing_type,aoc_fee,credits_per_usd,effective_period,created_by,request_key)
      VALUES($1,$2,$3,$4,$5,$6) RETURNING *`,
    [policy.pricingType,policy.aocFee,policy.creditsPerUsd,effective,String(actorId),key])).rows[0]);
  });
}

export async function allocateReportingCredits(pool,input,actorId) {
  const adjustment=validateCreditAdjustment(input),range=spendingPeriod(input.period);
  if(range.period>currentPeriod())throw new TypeError("Choose a current or past reporting period.");
  return transaction(pool,async db=>{
    const client=(await db.query("SELECT id FROM portal_clients WHERE id=$1 FOR SHARE",[adjustment.clientId])).rows[0];
    if(!client)throw new TypeError("Choose an existing client.");
    const key=adjustment.clientId+":manual:"+adjustment.idempotencyKey;
    const previous=(await db.query("SELECT period,credits::text,to_jsonb(e)->>'reason' AS reason FROM portal_ai_credit_entries e WHERE entry_key=$1",[key])).rows[0];
    if(previous) {
      if(previous.period!==range.period || normalizeCreditDecimal(previous.credits)!==adjustment.amount
        || (previous.reason!=null && previous.reason!==creditAdjustmentReason(input.reason)))
        throw new CreditsConflict("This adjustment key was already used for different details.");
      return {recorded:true,duplicate:true,mode:"reporting_only"};
    }
    const reason=creditAdjustmentReason(input.reason);
    const saved=(await db.query(`INSERT INTO portal_ai_credit_entries
      (entry_key,client_id,period,kind,credits,basis,actor_id,occurred_at,reason)
      VALUES($1,$2,$3,CASE WHEN $4::numeric>0 THEN 'allocation' ELSE 'adjustment' END,$4,'manual',$5,NOW(),$6)
      ON CONFLICT(entry_key) DO NOTHING RETURNING entry_key`,
    [key,adjustment.clientId,range.period,adjustment.amount,String(actorId),reason])).rows[0];
    if(!saved) {
      const prior=(await db.query("SELECT period,credits::text,reason FROM portal_ai_credit_entries WHERE entry_key=$1",[key])).rows[0];
      if(prior.period!==range.period || normalizeCreditDecimal(prior.credits)!==adjustment.amount || prior.reason!==reason)
        throw new CreditsConflict("This adjustment key was already used. Reload before making a different adjustment.");
    }
    return {recorded:true,duplicate:!saved,mode:"reporting_only"};
  });
}

export async function reconcileCreditPeriod(pool,clientId,period) {
  const range=spendingPeriod(period);
  return transaction(pool,async db=>{
    const client=(await db.query("SELECT id FROM portal_clients WHERE id=$1 FOR SHARE",[clientId])).rows[0];
    if(!client)throw new TypeError("Client unavailable.");
    await db.query(`INSERT INTO portal_ai_credit_periods(client_id,period,pricing_id)
      SELECT $1,$2,id FROM portal_ai_credit_pricing WHERE effective_period<=$2
      ORDER BY effective_period DESC,id DESC LIMIT 1 ON CONFLICT(client_id,period) DO NOTHING`,[clientId,period]);
    const policy=(await db.query(`SELECT p.* FROM portal_ai_credit_periods s JOIN portal_ai_credit_pricing p ON p.id=s.pricing_id
      WHERE s.client_id=$1 AND s.period=$2 FOR UPDATE OF s`,[clientId,period])).rows[0];
    if(!policy)return null;
    // One immutable fixed-fee entry per client/month, not once per message.
    if(policy.pricing_type==="fixed") await db.query(`INSERT INTO portal_ai_credit_entries
      (entry_key,client_id,period,kind,pricing_id,credits,api_cost_usd,aoc_fee_usd,basis,occurred_at)
      VALUES($1,$2,$3,'fixed_fee',$4,-($5::numeric*$6::numeric),0,$5,'estimated',$7)
      ON CONFLICT(entry_key) DO NOTHING`,[clientId+":fixed:"+period,clientId,period,policy.id,
      policy.aoc_fee,policy.credits_per_usd,range.start]);
    await db.query(`INSERT INTO portal_ai_credit_entries
      (entry_key,client_id,period,kind,source_event_key,pricing_id,credits,api_cost_usd,aoc_fee_usd,basis,occurred_at)
      SELECT 'usage:'||e.event_key,e.client_id,$2,'usage',e.event_key,$3,
        CASE WHEN e.amount_usd IS NOT NULL THEN
          -ROUND((e.amount_usd+CASE WHEN $4='percentage' THEN ROUND(e.amount_usd*$5::numeric/100,12) ELSE 0 END)*$6::numeric,12) END,
        e.amount_usd,CASE WHEN e.amount_usd IS NOT NULL THEN
          CASE WHEN $4='percentage' THEN ROUND(e.amount_usd*$5::numeric/100,12) ELSE 0 END END,e.basis,e.occurred_at
      FROM portal_ai_cost_events e WHERE e.client_id=$1 AND e.occurred_at>=$7 AND e.occurred_at<$8 AND ${usageSinceReset("e")}
      ON CONFLICT DO NOTHING`,[clientId,period,policy.id,policy.pricing_type,policy.aoc_fee,policy.credits_per_usd,range.start,range.end]);
    return policyRecord(policy);
  });
}

export async function readClientCredits(pool,clientId,{period=currentPeriod(),group="day",offset=0,summary=false,asOf="",readOnly=false}={}) {
  const range=spendingPeriod(period);
  if(asOf)creditSnapshot(asOf);
  if(period>currentPeriod() || !["day","month"].includes(group) || !Number.isSafeInteger(offset) || offset<0 || offset>10000)
    throw new TypeError("Choose a valid current/past month and usage grouping.");
  try {
    let policy,periodPrepared=true;
    if(readOnly) {
      const pinned=(await pool.query(`SELECT p.* FROM portal_ai_credit_periods s JOIN portal_ai_credit_pricing p ON p.id=s.pricing_id WHERE s.client_id=$1 AND s.period=$2`,[clientId,period])).rows[0];
      periodPrepared=Boolean(pinned);
      const effective=pinned || (await pool.query("SELECT * FROM portal_ai_credit_pricing WHERE effective_period<=$1 ORDER BY effective_period DESC,id DESC LIMIT 1",[period])).rows[0];
      policy=policyRecord(effective);
    } else policy=await reconcileCreditPeriod(pool,clientId,period);
    const transactionAsOf=creditSnapshot(asOf);
    const data=(await pool.query(`SELECT
      (SELECT started_at FROM portal_ai_cost_state WHERE id=1) AS tracking_started,
      (SELECT MAX(reset_before) FROM portal_ai_usage_resets WHERE client_id=$1 AND (period='all' OR period=to_char($2::timestamptz AT TIME ZONE 'UTC','YYYY-MM')) AND reset_before>=$2 AND reset_before<$3) AS usage_reset_at,
      COUNT(*) AS events,COUNT(*) FILTER(WHERE basis='unknown') AS unknown_events,
      COUNT(*) FILTER(WHERE basis='estimated') AS estimated_events,
      COUNT(*) FILTER(WHERE kind='chat' AND (input_tokens IS NULL OR output_tokens IS NULL)) AS missing_token_events,
      COUNT(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM portal_ai_credit_entries x WHERE x.source_event_key=e.event_key)) AS pending_events,
      COALESCE(SUM(amount_usd),0)::text AS known_usd,
      COALESCE(SUM(amount_usd) FILTER(WHERE provider='openai'),0)::text AS openai_usd,
      COALESCE(SUM(amount_usd) FILTER(WHERE provider='openrouter'),0)::text AS openrouter_usd,
      COALESCE(SUM(amount_usd) FILTER(WHERE kind='hosted_tool'),0)::text AS tool_usd,
      SUM(input_tokens)::text AS input_tokens,SUM(output_tokens)::text AS output_tokens,SUM(cached_tokens)::text AS cached_tokens,
      (SELECT COUNT(*) FROM portal_ai_usage_events u WHERE u.client_id=$1 AND u.action='client_ai.reply'
        AND u.started_at>=$2 AND u.started_at<$3 AND ${usageSinceReset('u','started_at')} AND NOT EXISTS
          (SELECT 1 FROM portal_ai_cost_events c WHERE c.request_id=u.request_id AND c.client_id=$1)) AS missing_turns
      FROM portal_ai_cost_events e WHERE client_id=$1 AND occurred_at>=$2 AND occurred_at<$3 AND ${usageSinceReset('e')}`,
    [clientId,range.start,range.end])).rows[0];
    const credit=(await pool.query(`SELECT COUNT(*) FILTER(WHERE kind IN ('allocation','adjustment')) AS grants,
      COALESCE(SUM(credits) FILTER(WHERE kind IN ('allocation','adjustment')),0)::text AS allocated,
      (-COALESCE(SUM(credits) FILTER(WHERE kind IN ('usage','fixed_fee')),0))::text AS used,
      (-COALESCE(SUM(credits) FILTER(WHERE kind='usage'),0))::text AS ai_usage,
      (-COALESCE(SUM(credits) FILTER(WHERE kind='fixed_fee'),0))::text AS fixed_fee_credits,
      COALESCE(SUM(aoc_fee_usd) FILTER(WHERE kind='fixed_fee'),0)::text AS fixed_fee_usd,
      COALESCE(SUM(aoc_fee_usd),0)::text AS fee,
      COALESCE(SUM(api_cost_usd+aoc_fee_usd) FILTER(WHERE kind IN ('usage','fixed_fee')),0)::text AS total,
      GREATEST(COALESCE(SUM(credits),0),0)::text AS remaining,
      GREATEST(-COALESCE(SUM(credits),0),0)::text AS overage
      FROM portal_ai_credit_entries e WHERE client_id=$1 AND period=$2 AND ${creditSinceReset('e')}`,[clientId,period])).rows[0];
    const transactions=summary?[]:(await pool.query(`SELECT e.kind,e.credits::text,e.api_cost_usd::text,e.aoc_fee_usd::text,
      e.basis,e.occurred_at,e.recorded_at,k.kind AS cost_kind,k.status,
      CASE WHEN u.action='client_ai.reply' THEN 'Client AI request' END AS activity
      FROM portal_ai_credit_entries e LEFT JOIN portal_ai_cost_events k ON k.event_key=e.source_event_key AND k.client_id=e.client_id
      LEFT JOIN portal_ai_usage_events u ON u.request_id=k.request_id AND u.client_id=e.client_id
      WHERE e.client_id=$1 AND e.period=$2 AND e.recorded_at<=$4 AND ${creditSinceReset('e')}
      ORDER BY e.occurred_at DESC,e.recorded_at DESC,e.entry_key DESC LIMIT 51 OFFSET $3`,[clientId,period,offset,transactionAsOf])).rows;
    const history=summary?[]:(await pool.query(`SELECT to_char(date_trunc($4,occurred_at AT TIME ZONE 'UTC'),'YYYY-MM-DD') AS day,
      COUNT(*) AS events,SUM(input_tokens)::text AS input_tokens,SUM(output_tokens)::text AS output_tokens,
      COALESCE(SUM(amount_usd),0)::text AS known_usd,COUNT(*) FILTER(WHERE basis='unknown') AS unpriced
      FROM portal_ai_cost_events e WHERE client_id=$1 AND occurred_at>=$2 AND occurred_at<$3 AND ${usageSinceReset('e')}
      GROUP BY 1 ORDER BY 1 DESC LIMIT 32`,[clientId,range.start,range.end,group])).rows;
    const months=summary?[]:(await pool.query(`WITH cost_months AS (
      SELECT to_char(occurred_at AT TIME ZONE 'UTC','YYYY-MM') AS period,COALESCE(SUM(amount_usd),0) AS api_usd,
        COUNT(*) FILTER(WHERE basis='unknown') AS unpriced,
        COUNT(*) FILTER(WHERE basis='estimated') AS estimates,
        COUNT(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM portal_ai_credit_entries x WHERE x.source_event_key=e.event_key)) AS pending
      FROM portal_ai_cost_events e WHERE client_id=$1 AND ${usageSinceReset('e')} GROUP BY 1),
      credit_months AS (SELECT period,(-COALESCE(SUM(credits) FILTER(WHERE kind IN ('usage','fixed_fee')),0)) AS used,
        COALESCE(SUM(aoc_fee_usd),0) AS fee_usd FROM portal_ai_credit_entries e WHERE client_id=$1 AND ${creditSinceReset('e')} GROUP BY period
        HAVING COUNT(*) FILTER(WHERE kind IN ('usage','fixed_fee'))>0),
      missing_months AS (SELECT to_char(started_at AT TIME ZONE 'UTC','YYYY-MM') AS period,COUNT(*) AS missing
        FROM portal_ai_usage_events u WHERE client_id=$1 AND action='client_ai.reply' AND ${usageSinceReset('u','started_at')}
        AND NOT EXISTS(SELECT 1 FROM portal_ai_cost_events e WHERE e.request_id=u.request_id AND e.client_id=u.client_id) GROUP BY 1),
      periods AS (SELECT period FROM cost_months UNION SELECT period FROM credit_months UNION SELECT period FROM missing_months)
      SELECT p.period,c.api_usd::text,c.unpriced,c.estimates,c.pending,m.missing,
        CASE WHEN s.pricing_id IS NOT NULL THEN k.used::text END AS used,
        CASE WHEN s.pricing_id IS NOT NULL THEN k.fee_usd::text END AS fee_usd
      FROM periods p LEFT JOIN cost_months c ON c.period=p.period LEFT JOIN credit_months k ON k.period=p.period
      LEFT JOIN missing_months m ON m.period=p.period
      LEFT JOIN portal_ai_credit_periods s ON s.client_id=$1 AND s.period=p.period
      ORDER BY 1 DESC LIMIT 12`,[clientId])).rows;
    const unpricedBreakdown=summary?[]:(await pool.query(`SELECT kind,status,reason,COUNT(*) AS events
      FROM portal_ai_cost_events e WHERE client_id=$1 AND occurred_at>=$2 AND occurred_at<$3 AND basis='unknown' AND ${usageSinceReset('e')}
      GROUP BY kind,status,reason ORDER BY events DESC,kind,status,reason`,[clientId,range.start,range.end])).rows;
    const pending=policy?Number(data.pending_events):0;
    const needsPreparation=Boolean(readOnly && policy && !periodPrepared && Number(data.events)>0);
    const incomplete=Number(data.unknown_events)>0 || Number(data.missing_turns)>0 || pending>0 || needsPreparation;
    return {ready:true,mode:"reporting_only",clientId:String(clientId),period,range,currency:"USD",pricing:policy,
      availableCredits:policy && Number(credit.grants)>0 && !incomplete?credit.remaining:null,
      allocatedCredits:Number(credit.grants)>0?credit.allocated:null,creditsUsed:policy?credit.used:null,
      aiUsageCredits:policy?credit.ai_usage:null,fixedFeeCredits:policy?credit.fixed_fee_credits:null,
      fixedFeeUsd:policy?credit.fixed_fee_usd:null,
      overageCredits:policy && Number(credit.grants)>0 && !incomplete?credit.overage:null,
      apiCostUsd:data.known_usd,openaiCostUsd:data.openai_usd,openrouterCostUsd:data.openrouter_usd,toolCostUsd:data.tool_usd,
      aocFeeUsd:policy?credit.fee:null,totalClientCostUsd:policy && !incomplete?credit.total:null,
      knownClientCostUsd:policy?credit.total:null,unpricedEvents:Number(data.unknown_events),missingTurns:Number(data.missing_turns),
      pricingExample:policy?previewCreditPricing(policy,"1"):null,unpricedBreakdown,
      needsPreparation,
      pendingUsageEvents:pending,
      estimatedEvents:Number(data.estimated_events),missingTokenEvents:Number(data.missing_token_events),incomplete,
      inputTokens:data.input_tokens ?? (Number(data.events)===0?"0":null),
      outputTokens:data.output_tokens ?? (Number(data.events)===0?"0":null),
      cachedTokens:data.cached_tokens ?? (Number(data.events)===0?"0":null),
      usageResetAt:data.usage_reset_at || null,
      trackingStartedAt:data.tracking_started,partialHistory:!data.usage_reset_at && (!data.tracking_started || new Date(data.tracking_started)>new Date(range.start)),
      history,months,transactions:transactions.slice(0,50),hasMoreTransactions:transactions.length>50,offset,group,transactionAsOf,
      fetchedAt:new Date().toISOString()};
  } catch(error) {
    if(error.code!=="42P01")throw error;
    return {ready:false,mode:"reporting_only",clientId:String(clientId),availableCredits:null,
      setupMessage:"AI Credits reporting is being configured.",period};
  }
}
