import {randomUUID} from 'node:crypto';
import {changeAuditSql,boundedChangeDetails} from './admin-change-policy.js';
import {safeAuditName,safeAuditCode,safeAuditRoute,auditExplanation} from './admin-audit-policy.js';
export async function appendAdminOperation(db,event){
 await db.query(`INSERT INTO portal_admin_operation_audit(event_id,request_id,phase,origin,actor_user_id,actor_name,client_id,
  operation,category,outcome,method,route,http_status,duration_ms,error_code,source_location,summary,details)
  VALUES($1,$2,$3,$4,$5,$6,(SELECT id FROM portal_clients WHERE id=$7),$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb)
  ON CONFLICT(request_id,phase) DO NOTHING`,[event.eventId||randomUUID(),event.requestId,event.phase,event.origin||'server',event.actor?.id||null,
   safeAuditName(event.actor?.name||'Unverified request'),event.clientId||null,event.operation,event.category,event.outcome,event.method||'UI',safeAuditRoute(event.route),event.status||null,
   event.duration==null?null:Math.min(86400000,Math.max(0,Math.round(event.duration))),event.code||null,event.location||null,event.summary,JSON.stringify(boundedChangeDetails(event.details||{}))]);
}
// Compatibility only: old browser batches are acknowledged without storing them.
export async function appendBrowserOperations(){return {accepted:0,disabled:true};}
export async function readAdminOperations(db,options={}){
 const ready=(await db.query("SELECT to_regclass('portal_admin_operation_audit') IS NOT NULL AS ready")).rows[0].ready;
 if(!ready)return {ready:false,message:'Apply the admin operation audit migration to enable the detailed timeline.'};
 const page=/^[1-9][0-9]{0,3}$/.test(String(options.page||''))?Number(options.page):1;
 const client=/^[1-9][0-9]{0,18}$/.test(String(options.clientId||''))&&BigInt(options.clientId)<=9223372036854775807n?String(options.clientId):null;
 const outcome=['succeeded','failed','denied','cancelled','info','blocked','started'].includes(options.outcome)?options.outcome:null;
 const category=['read','change','navigation','interaction','validation','error','authentication'].includes(options.category)?options.category:null;
 const actor=/^[1-9][0-9]{0,18}$/.test(String(options.actorId||''))&&BigInt(options.actorId)<=9223372036854775807n?String(options.actorId):null;
 const asOf=typeof options.asOf==='string'&&/^20[0-9T:.Z-]{20,30}$/.test(options.asOf)&&Number.isFinite(Date.parse(options.asOf))?options.asOf:new Date().toISOString();
 const reference=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(options.reference||'')?options.reference:null;
 const result=await db.query(`WITH latest AS (SELECT DISTINCT ON(request_id) * FROM portal_admin_operation_audit
  WHERE ${changeAuditSql} AND occurred_at<=$1 AND ($2::bigint IS NULL OR client_id=$2)
  ORDER BY request_id,CASE phase WHEN 'finished' THEN 2 WHEN 'browser' THEN 2 ELSE 1 END DESC,occurred_at DESC,id DESC),
  filtered AS (SELECT * FROM latest WHERE ($3::text IS NULL OR outcome=$3) AND ($4::text IS NULL OR category=$4)
   AND ($5::bigint IS NULL OR actor_user_id=$5) AND ($6::uuid IS NULL OR request_id=$6))
  SELECT f.*,COALESCE(c.display_name,'AOC / platform') AS client_name,
   COUNT(*) OVER()::int AS total,
   COUNT(*) FILTER(WHERE outcome='succeeded') OVER()::int AS succeeded,
   COUNT(*) FILTER(WHERE outcome IN ('failed','denied','blocked','cancelled')) OVER()::int AS attention
  FROM filtered f LEFT JOIN portal_clients c ON c.id=f.client_id ORDER BY occurred_at DESC,id DESC LIMIT 21 OFFSET $7`,
  [asOf,client,outcome,category,actor,reference,(page-1)*20]);
 const clients=(await db.query('SELECT id::text,display_name AS name FROM portal_clients ORDER BY display_name')).rows;
 const actors=(await db.query("SELECT DISTINCT actor_user_id::text AS id,actor_name AS name FROM portal_admin_operation_audit WHERE actor_user_id IS NOT NULL AND origin IN ('server','auth') AND category IN ('change','authentication') ORDER BY name LIMIT 200")).rows;
 return {ready:true,rows:result.rows.slice(0,20),hasMore:result.rows.length>20,clients,actors,page,asOf,
  totals:{all:result.rows[0]?.total||0,succeeded:result.rows[0]?.succeeded||0,attention:result.rows[0]?.attention||0}};
}
export {safeAuditCode,auditExplanation};
