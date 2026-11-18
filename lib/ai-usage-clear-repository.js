import {usageClearPreview} from './ai-usage-clear-policy.js';
import {usageSinceReset} from './ai-usage-reset-sql.js';

export async function usageClearReady(db) {
  const row=(await db.query(`SELECT COUNT(*)::int AS columns,to_regclass('portal_ai_usage_resets') IS NOT NULL AS reset_ready
    FROM pg_attribute WHERE attrelid IN (to_regclass('portal_ai_usage_events'),to_regclass('portal_ai_cost_events'))
      AND attname IN ('cleared_at','cleared_by','clear_operation') AND NOT attisdropped`)).rows[0];
  return row.columns===6 && row.reset_ready;
}
async function requireReady(db) {
  if(!await usageClearReady(db))throw Object.assign(Error('AI usage reset needs setup. Run npm run usage-controls:migrate against this database.'),{usageSetup:true});
}
const usagePredicate=`u.action=$1 AND ($2::bigint IS NULL OR u.client_id=$2)
  AND ($3::timestamptz IS NULL OR u.started_at>=$3) AND ($4::timestamptz IS NULL OR u.started_at<$4)
  AND u.finished_at<=$5 AND (u.action='client_ai.reply' OR u.cleared_at IS NULL) AND ${usageSinceReset('u','started_at')}`;
const costPredicate=`($2::bigint IS NULL OR e.client_id=$2)
  AND (CASE WHEN $1='client_ai.reply' THEN e.client_id IS NOT NULL ELSE
    EXISTS(SELECT 1 FROM portal_ai_usage_events a WHERE a.request_id=e.request_id AND a.action=$1) END)
  AND ($3::timestamptz IS NULL OR e.occurred_at>=$3) AND ($4::timestamptz IS NULL OR e.occurred_at<$4)
  AND e.recorded_at<=$5 AND ($1='client_ai.reply' OR e.cleared_at IS NULL) AND ${usageSinceReset('e')}`;
const parameters=plan=>[plan.action,plan.clientId,plan.start,plan.end,plan.before];

export async function previewAiUsageClear(db,input,actorId,secret) {
  await requireReady(db);
  const {plan,token}=usageClearPreview(input,actorId,secret);
  let label=plan.scope==='admin'?'AOC Admin AI chat':'All client AI chat';
  if(plan.clientId) {
    const client=(await db.query('SELECT display_name FROM portal_clients WHERE id=$1',[plan.clientId])).rows[0];
    if(!client)throw new TypeError('Choose an existing client.');label=client.display_name;
  }
  const clients=plan.scope==='admin'?0:(await db.query('SELECT COUNT(*)::int AS total FROM portal_clients WHERE ($1::bigint IS NULL OR id=$1)',[plan.clientId])).rows[0].total;
  const totals=(await db.query(`SELECT COUNT(*)::int AS requests,COALESCE(SUM(u.input_tokens),0)::text AS input_tokens,
    COALESCE(SUM(u.output_tokens),0)::text AS output_tokens,COUNT(*) FILTER(WHERE u.input_tokens IS NULL)::int AS unreported,
    COUNT(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM portal_ai_cost_events k WHERE k.request_id=u.request_id))::int AS missing_costs
    FROM portal_ai_usage_events u WHERE ${usagePredicate}`,parameters(plan))).rows[0];
  const costs=(await db.query(`SELECT COUNT(*)::int AS events,COALESCE(SUM(e.amount_usd),0)::text AS known_usd,
    COUNT(*) FILTER(WHERE e.amount_usd IS NULL)::int AS unpriced FROM portal_ai_cost_events e WHERE ${costPredicate}`,parameters(plan))).rows[0];
  return {token,label,scope:plan.scope,clientId:plan.clientId,clients,period:plan.period,before:plan.before,
    requests:totals.requests,inputTokens:totals.input_tokens,outputTokens:totals.output_tokens,unreported:totals.unreported,
    missingCosts:totals.missing_costs,costEvents:costs.events,knownUsd:costs.known_usd,unpriced:costs.unpriced};
}

// Reset report accounting together with activity. Raw rows remain for audit.
// A monotonic boundary also excludes pre-reset requests that finish afterwards.
export async function clearAiUsageHistory(db,plan) {
  await requireReady(db);
  const row=(await db.query(`WITH boundaries AS (
    INSERT INTO portal_ai_usage_resets(client_id,period,reset_before,operation_id,actor_user_id)
    SELECT id,$9,$5::timestamptz,$7::uuid,$6 FROM portal_clients
      WHERE $1='client_ai.reply' AND ($2::bigint IS NULL OR id=$2) ORDER BY id
    ON CONFLICT(client_id,period) DO UPDATE SET reset_before=EXCLUDED.reset_before,
      operation_id=EXCLUDED.operation_id,actor_user_id=EXCLUDED.actor_user_id,recorded_at=NOW()
      WHERE portal_ai_usage_resets.reset_before<EXCLUDED.reset_before
    RETURNING client_id
  ), cleared AS (
    UPDATE portal_ai_usage_events u SET cleared_at=NOW(),cleared_by=$6,clear_operation=$7::uuid
    WHERE ${usagePredicate} AND u.cleared_at IS NULL RETURNING request_id
  ), costs AS (
    UPDATE portal_ai_cost_events e SET cleared_at=NOW(),cleared_by=$6,clear_operation=$7::uuid
    WHERE ${costPredicate} AND e.cleared_at IS NULL RETURNING event_key
  ), logged AS (
    INSERT INTO portal_audit_events(audience,client_id,actor_user_id,action,target_type,target_id)
    SELECT 'aoc_admin',$2,$6,'aoc.ai_usage.reset','ai_usage_reset',$8
    WHERE EXISTS(SELECT 1 FROM cleared) OR EXISTS(SELECT 1 FROM costs) OR EXISTS(SELECT 1 FROM boundaries) RETURNING id
  ) SELECT (SELECT COUNT(*)::int FROM cleared) AS cleared,(SELECT COUNT(*)::int FROM costs) AS costs_cleared,
    (SELECT COUNT(*)::int FROM boundaries) AS clients_reset`,
  [...parameters(plan),plan.actorId,plan.operationId,plan.period+':'+plan.operationId,plan.period])).rows[0];
  return {cleared:row.cleared,costsCleared:row.costs_cleared,clientsReset:row.clients_reset,
    scope:plan.scope,clientId:plan.clientId,period:plan.period,before:plan.before,reset:true};
}
