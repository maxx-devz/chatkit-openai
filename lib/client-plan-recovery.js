import {planClientId} from './client-plan-policy.js';
// Explicit, scoped operator repair. Never used by a GET or a client action.
export async function recoverClientPlanFailures(pool,{clientId,actorId,apply=false}) {
 clientId=planClientId(clientId);if(apply)actorId=planClientId(actorId);
 const db=await pool.connect();try {
  await db.query(apply?'BEGIN':'BEGIN READ ONLY');await db.query("SET LOCAL lock_timeout='3s'");
  if(!(await db.query('SELECT id FROM portal_clients WHERE id=$1'+(apply?' FOR UPDATE':''),[clientId])).rows.length)throw Error('Client does not exist');
  if(apply&&!(await db.query('SELECT user_id FROM portal_admins WHERE user_id=$1 AND is_active=TRUE FOR SHARE',[actorId])).rows.length)throw Error('Active admin actor required');
  await db.query('SELECT client_id FROM portal_client_plans WHERE client_id=$1'+(apply?' FOR UPDATE':''),[clientId]);
  const candidates=(await db.query(`SELECT r.id::text,r.credits_used::text,r.status,
   CASE WHEN EXISTS(SELECT 1 FROM portal_ai_usage_events u WHERE u.request_id=r.id AND u.client_id=r.client_id AND u.status IN ('failed','cancelled')) THEN 'request_failed' ELSE 'reply_interrupted' END AS code
   FROM portal_client_plan_runs r WHERE r.client_id=$1
   AND (r.status<>'settled' OR r.credits_used>0)
   AND (r.status<>'running' OR r.started_at<NOW()-INTERVAL '3 minutes')
   AND NOT EXISTS(SELECT 1 FROM portal_ai_usage_events u WHERE u.request_id=r.id AND u.client_id=r.client_id AND u.status='succeeded')
   AND (EXISTS(SELECT 1 FROM portal_ai_usage_events u WHERE u.request_id=r.id AND u.client_id=r.client_id AND u.status IN ('failed','cancelled'))
     OR r.status='running' AND r.started_at<NOW()-INTERVAL '3 minutes')
   ORDER BY r.id`+(apply?' FOR UPDATE OF r':''),[clientId])).rows;
  if(apply)for(const row of candidates) {
   await db.query("UPDATE portal_client_plan_runs SET status='settled',credits_used=0,finished_at=COALESCE(finished_at,NOW()) WHERE id=$1 AND client_id=$2",[row.id,clientId]);
   await db.query(`INSERT INTO portal_client_plan_audit(client_id,actor_id,action,reason,details) VALUES($1,$2,'reply_failed_correction',$3,$4::jsonb)`,[clientId,actorId,'Unsuccessful reply not billed to client; provider expense retained',JSON.stringify({runId:row.id,code:row.code,previousStatus:row.status,previousClientCredits:row.credits_used,clientCreditsCharged:'0',clientBilling:'not_billed'})]);
  }
  await db.query('COMMIT');return {clientId,applied:apply,affected:candidates.length,records:candidates.map(row=>({id:row.id,previousCredits:row.credits_used,code:row.code}))};
 }catch(error){await db.query('ROLLBACK').catch(()=>{});throw error;}finally{db.release();}
}
