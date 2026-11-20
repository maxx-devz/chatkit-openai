// Read-only enrichment for authorized AOC history; no time-based or target-based guessing.
export async function attachAdminHistoryResponses(db,rows){
 const keys=rows.filter(e=>['action','access'].includes(e.kind)&&/^[1-9][0-9]*$/.test(String(e.id))).map(e=>({kind:e.kind,id:String(e.id),actor_id:e.actor_user_id==null?null:String(e.actor_user_id),client_id:e.client_id==null?null:String(e.client_id)}));
 if(!keys.length)return rows;
 try{
  if(!(await db.query("SELECT to_regclass('portal_admin_operation_audit') IS NOT NULL AS ready")).rows[0]?.ready)return rows;
  const result=await db.query(`WITH requested AS (SELECT * FROM jsonb_to_recordset($1::jsonb) AS r(kind TEXT,id TEXT,actor_id TEXT,client_id TEXT))
   SELECT DISTINCT r.kind,r.id,a.request_id::text,a.http_status,a.outcome,a.summary,a.method,a.route,a.error_code,a.source_location,a.duration_ms
   FROM portal_admin_operation_audit a
   CROSS JOIN LATERAL jsonb_to_recordset(CASE WHEN jsonb_typeof(a.details->'legacy_events')='array' THEN a.details->'legacy_events' ELSE '[]'::jsonb END) AS linked(kind TEXT,id TEXT)
   JOIN requested r ON r.kind=linked.kind AND r.id=linked.id
   WHERE a.phase='finished' AND a.origin='server' AND a.actor_user_id::text=r.actor_id
    AND (r.client_id IS NULL OR a.client_id::text=r.client_id)`,[JSON.stringify(keys)]);
  const matches=new Map();for(const record of result.rows){const key=record.kind+':'+record.id;const list=matches.get(key)||[];list.push(record);matches.set(key,list);}
  // Ambiguous links are not presented as a confirmed response.
  return rows.map(row=>{const list=matches.get(row.kind+':'+row.id);return list?.length===1?{...row,request_details:list[0]}:row;});
 }catch{return rows.map(row=>({...row,request_details_unavailable:true}));}
}
