import {readClientCredits} from "./credits-repository.js";
export async function readAdminCreditReport(db,clientId,period) {
  if(!/^[1-9][0-9]{0,18}$/.test(String(clientId)) || BigInt(clientId)>9223372036854775807n)throw new TypeError("Choose a valid client.");
  const client=(await db.query("SELECT id::text,display_name AS name,to_jsonb(c)->>'slug' AS slug FROM portal_clients c WHERE id=$1",[clientId])).rows[0];
  if(!client)throw new TypeError("Choose an existing client.");
  const report=await readClientCredits(db,clientId,{period,summary:true,readOnly:true});
  if(!report.ready)return {...report,client};
  const adjustments=(await db.query(`SELECT kind,credits::text,actor_id,to_jsonb(e)->>'reason' AS reason,occurred_at,recorded_at
    FROM portal_ai_credit_entries e WHERE client_id=$1 AND period=$2 AND kind IN ('allocation','adjustment')
    ORDER BY recorded_at DESC,entry_key DESC LIMIT 20`,[clientId,report.period])).rows;
  return {...report,client,adjustments};
}
