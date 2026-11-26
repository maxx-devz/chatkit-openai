import {noteAdminAuditSaved} from './admin-audit-context.js';
import {planClientId,planPeriod,planMutation,planAvailability,planText} from './client-plan-policy.js';
import {creditRequestKey} from './credits-pricing.js';
export class PlanConflict extends Error {}
async function tx(pool,run) {const db=await pool.connect();try{await db.query('BEGIN');const result=await run(db);await db.query('COMMIT');return result;}catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}}
export async function readClientPlan(db,clientId,{period=planPeriod(),admin=false}={}) {
 clientId=planClientId(clientId);period=planPeriod(period);
 const ready=(await db.query("SELECT to_regclass('portal_client_plans') IS NOT NULL AS ready")).rows[0].ready;
 if(!ready)return {ready:false,configured:false,clientId,period,setupMessage:'Client plans need the client-plans migration before setup.'};
 const row=(await db.query(`SELECT
  jsonb_build_object('monthly_price',p.monthly_price::text,'monthly_credits',p.monthly_credits::text,'status',p.status,'version',p.version::text) AS plan,
  (SELECT jsonb_build_object('monthly_price',b.monthly_price::text,'included_credits',b.included_credits::text,
   'extra_credits',b.extra_credits::text,'used_credits',b.used_credits::text,'activated_at',b.activated_at,
   'remaining',GREATEST(b.included_credits+b.extra_credits-b.used_credits,0)::text)
   FROM portal_client_plan_balances b WHERE b.client_id=p.client_id AND b.period=$2) AS month,
  COALESCE((SELECT jsonb_agg(r) FROM (SELECT u.id::text,u.status,u.started_at,u.finished_at,u.period,
   (u.status='review' OR u.started_at<NOW()-INTERVAL '3 minutes') AS resolvable,
   (u.status='running' AND u.started_at<NOW()-INTERVAL '3 minutes' AND (COALESCE(e.status,'')<>'succeeded'
     OR EXISTS(SELECT 1 FROM portal_ai_cost_events x WHERE x.request_id=u.id AND x.client_id=u.client_id)
       AND NOT EXISTS(SELECT 1 FROM portal_ai_cost_events x WHERE x.request_id=u.id AND x.client_id=u.client_id AND (x.amount_usd IS NULL OR x.basis='unknown')))
    OR u.status='review' AND e.status IN ('failed','cancelled')) IS TRUE AS recoverable
   FROM portal_client_plan_runs u LEFT JOIN portal_ai_usage_events e ON e.request_id=u.id AND e.client_id=u.client_id
   WHERE u.client_id=p.client_id AND u.status IN ('running','review') ORDER BY u.started_at LIMIT 10) r),'[]'::jsonb) AS runs,
  CASE WHEN $3 THEN COALESCE((SELECT jsonb_agg(d) FROM (SELECT action,reason,created_at,
    details->>'runId' AS request_id,details->>'code' AS error_code,details->>'httpStatus' AS http_status,
    details->>'providerRequestId' AS provider_request_id,details->>'provider' AS provider,
    details->>'clientBilling' AS client_billing
    FROM portal_client_plan_audit WHERE client_id=p.client_id AND action IN ('reply_failed','reply_recovered','reply_usage_unavailable','reply_failed_correction','release')
    ORDER BY id DESC LIMIT 20) d),'[]'::jsonb) ELSE '[]'::jsonb END AS provider_issues,
  COALESCE((SELECT jsonb_agg(q) FROM (SELECT r.id::text,r.kind,r.note,r.status,r.created_at,r.closed_at,
   g.granted_credits,g.granted_period
   FROM portal_client_plan_requests r
   LEFT JOIN LATERAL (
    SELECT SUM(t.credits)::text AS granted_credits,
     CASE WHEN COUNT(DISTINCT t.period)=1 THEN MIN(t.period) END AS granted_period
    FROM portal_client_plan_topups t WHERE t.client_id=r.client_id AND t.request_id=r.id
   ) g ON TRUE
   WHERE r.client_id=p.client_id ORDER BY r.created_at DESC,r.id DESC LIMIT 20) q),'[]'::jsonb) AS requests,
  CASE WHEN $3 THEN COALESCE((SELECT jsonb_agg(a) FROM (SELECT action,reason,created_at FROM portal_client_plan_audit
   WHERE client_id=p.client_id ORDER BY id DESC LIMIT 20) a),'[]'::jsonb) ELSE '[]'::jsonb END AS audit
  FROM portal_client_plans p WHERE p.client_id=$1`,[clientId,period,admin])).rows[0];
 const {plan=null,month=null,runs=[],requests=[],audit=[],provider_issues=[]}=row||{};
 const blockingRuns=runs.filter(run=>!run.recoverable);
 const availability=planAvailability({configured:!!plan,status:plan?.status,entitled:!!month,pending:blockingRuns.length>0,pendingState:blockingRuns.some(run=>run.resolvable)?'review':'running',remaining:month?.remaining});
 const result={ready:true,mode:'subscription',configured:!!plan,clientId,period,plan,month,...availability,
  availableCredits:month?.remaining??null,allocatedCredits:month?String(BigInt(month.included_credits)+BigInt(month.extra_credits)):null,
  aiUsageCredits:month?.used_credits??null,creditsUsed:month?.used_credits??null,creditsPerUsd:1000,requests,
  fetchedAt:new Date().toISOString()};
 if(admin){result.runs=runs;result.audit=audit;result.providerIssues=provider_issues;}
 return result;
}
export async function mutateClientPlan(pool,input,actorId) {
 const value=planMutation(input),period=planPeriod();actorId=String(actorId);
 const result=await tx(pool,async db=>{
  const authority=(await db.query('SELECT user_id FROM portal_admins WHERE user_id=$1 AND is_active=TRUE FOR SHARE',[actorId])).rows[0];
  if(!authority)throw new PlanConflict('Administrator access changed. Sign in again.');
  if(!(await db.query('SELECT id FROM portal_clients WHERE id=$1 FOR UPDATE',[value.clientId])).rows.length)throw new TypeError('Choose an existing client.');
  const old=(await db.query('SELECT client_id::text,actor_id,payload FROM portal_client_plan_operations WHERE id=$1',[value.id])).rows[0];
  if(old){if(old.client_id!==value.clientId||old.actor_id!==actorId||Object.keys(value).some(k=>old.payload[k]!==value[k])||Object.keys(old.payload).length!==Object.keys(value).length)throw new PlanConflict('This retry key belongs to a different action.');return {ok:true,duplicate:true};}
  let plan=(await db.query('SELECT * FROM portal_client_plans WHERE client_id=$1 FOR UPDATE',[value.clientId])).rows[0];
  if(value.action==='save') {
   if(String(plan?.version??0)!==value.expectedVersion)throw new PlanConflict('This plan changed. Refresh and review it before saving.');
   plan=(await db.query(`INSERT INTO portal_client_plans(client_id,monthly_price,monthly_credits,status,updated_by) VALUES($1,$2,$3,$4,$5)
    ON CONFLICT(client_id) DO UPDATE SET monthly_price=EXCLUDED.monthly_price,monthly_credits=EXCLUDED.monthly_credits,status=EXCLUDED.status,
     version=portal_client_plans.version+1,updated_by=EXCLUDED.updated_by,updated_at=NOW() RETURNING *`,[value.clientId,value.price,value.credits,value.status,actorId])).rows[0];
  }
  if(!plan)throw new TypeError('Save this client’s monthly plan first.');
  if(value.activate) {
   if(plan.status!=='active')throw new TypeError('Activate the plan status before confirming this month.');
   const inserted=await db.query(`INSERT INTO portal_client_plan_months(client_id,period,monthly_price,included_credits,payment_reference,confirmed_by)
    VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING RETURNING client_id`,[value.clientId,period,plan.monthly_price,plan.monthly_credits,value.paymentReference,actorId]);
   if(!inserted.rows.length)throw new PlanConflict('This month is already active. Use a paid credit addition for extra usage; existing credits are preserved.');
  }
  if(value.action==='topup') {
   if(!(await db.query('SELECT client_id FROM portal_client_plan_months WHERE client_id=$1 AND period=$2',[value.clientId,period])).rows.length)throw new TypeError('Confirm this month’s plan payment first.');
   if(value.requestId){const request=await db.query("UPDATE portal_client_plan_requests SET status='approved',closed_at=NOW() WHERE id=$1 AND client_id=$2 AND status='pending' RETURNING id",[value.requestId,value.clientId]);if(!request.rows.length)throw new PlanConflict('This request is no longer available for this client.');}
   await db.query(`INSERT INTO portal_client_plan_topups(id,client_id,period,credits,paid_usd,payment_reference,request_id,confirmed_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[value.id,value.clientId,period,value.credits,value.paid,value.paymentReference,value.requestId,actorId]);
  }
  if(value.action==='decline' && !(await db.query("UPDATE portal_client_plan_requests SET status='declined',closed_at=NOW() WHERE id=$1 AND client_id=$2 AND status='pending' RETURNING id",[value.requestId,value.clientId])).rows.length)throw new PlanConflict('This request is no longer available for this client.');
  if(value.action==='release') {
   const released=await db.query(`UPDATE portal_client_plan_runs SET status='settled',credits_used=0,finished_at=COALESCE(finished_at,NOW())
    WHERE id=$1 AND client_id=$2 AND (status='review' OR (status='running' AND started_at<NOW()-INTERVAL '3 minutes')) RETURNING id`,[value.runId,value.clientId]);
   if(!released.rows.length)throw new PlanConflict('The reply is still active or this incident was already closed.');
  }
  if(value.action==='resolve') {
   const done=await db.query(`UPDATE portal_client_plan_runs SET status='settled',credits_used=$3::numeric*1000,finished_at=NOW()
    WHERE id=$1 AND client_id=$2 AND (status='review' OR (status='running' AND started_at<NOW()-INTERVAL '3 minutes'))
     AND NOT EXISTS(SELECT 1 FROM portal_ai_usage_events u WHERE u.request_id=portal_client_plan_runs.id
      AND u.client_id=portal_client_plan_runs.client_id AND u.status IN ('failed','cancelled')) RETURNING id`,[value.runId,value.clientId,value.cost]);
   if(!done.rows.length)throw new PlanConflict('The request is still running or has already been resolved.');
  }
  await db.query('INSERT INTO portal_client_plan_audit(client_id,actor_id,action,reason,details) VALUES($1,$2,$3,$4,$5::jsonb)',[value.clientId,actorId,value.action,value.reason,JSON.stringify(value.action==='release'?{...value,code:'reply_interrupted',clientBilling:'not_billed'}:value)]);
  await db.query('INSERT INTO portal_client_plan_operations(id,client_id,actor_id,payload) VALUES($1,$2,$3,$4::jsonb)',[value.id,value.clientId,actorId,JSON.stringify(value)]);
  return {ok:true,duplicate:false};
 });
 // Only after COMMIT succeeds: submitted values are not evidence of a saved change.
 if(!result.duplicate)noteAdminAuditSaved({...value,...(value.activate||value.action==='topup'?{period,paymentConfirmed:true}:{})});
 return result;
}
export async function requestClientPlan(pool,clientId,userId,input) {
 clientId=planClientId(clientId);userId=planClientId(userId);
 const id=creditRequestKey(input.idempotencyKey),note=planText(input.note,500),kind=input.kind;
 if(!['credits','upgrade'].includes(kind))throw new TypeError('Choose more credits or a plan upgrade.');
 return tx(pool,async db=>{
  const allowed=await db.query(`SELECT m.client_id FROM portal_memberships m JOIN portal_clients c ON c.id=m.client_id
   WHERE m.client_id=$1 AND m.user_id=$2 AND m.is_active=TRUE AND m.role IN ('member','client_admin','aoc_admin') AND c.portal_enabled=TRUE FOR SHARE OF m,c`,[clientId,userId]);
  if(!allowed.rows.length)throw new PlanConflict('Your workspace access changed. Reload the page.');
  if(!(await db.query('SELECT client_id FROM portal_client_plans WHERE client_id=$1',[clientId])).rows.length)throw new TypeError('Ask your administrator to configure a plan first.');
  const existing=(await db.query('SELECT id::text,client_id::text,user_id::text,kind,note FROM portal_client_plan_requests WHERE id=$1',[id])).rows[0];
  if(existing){if(existing.client_id!==clientId||existing.user_id!==userId||existing.kind!==kind||existing.note!==note)throw new PlanConflict('This request key is already in use.');return {ok:true,duplicate:true};}
  const inserted=await db.query(`INSERT INTO portal_client_plan_requests(id,client_id,user_id,kind,note) VALUES($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING RETURNING id`,[id,clientId,userId,kind,note]);
  return {ok:true,duplicate:!inserted.rows.length};
 });
}
