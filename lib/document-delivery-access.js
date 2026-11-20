import "server-only";
import {databasePool as db} from "./database.js";
import {resolveAdminContext} from "./admin-data.js";
import {requireClientPermission} from "./portal-data.js";
import {assignmentError} from "./client-document-assignment-policy.js";
export function documentHost(headers){let host;try{host=new URL(process.env.BETTER_AUTH_URL).host;}catch{throw assignmentError("setup_required","Portal configuration needs attention.",503);}
 if(headers.get("host")!==host||headers.has("x-forwarded-host")&&headers.get("x-forwarded-host")!==host)throw assignmentError("untrusted_host","Use the configured portal address.",403);
}
export async function documentAdmin(headers){documentHost(headers);return resolveAdminContext(headers);}
export async function documentClient(headers,id){
 documentHost(headers);const c=await requireClientPermission(headers,"client.documents.read");
 const selected=(headers.get("cookie")||"").split(";").map(v=>v.trim()).find(v=>v.startsWith("aoc_active_client="));
 if(String(c.client.id)!==id||selected&&selected.slice(18)!==encodeURIComponent(c.client.slug))throw assignmentError("document_unavailable","This document is unavailable in the selected client workspace.",404);
 return c;
}
export async function adminDocumentTransaction(actor,client,work){
 const d=await db.connect();try{await d.query("BEGIN");await d.query("SET LOCAL lock_timeout='3s'");
 const ok=await d.query(`SELECT 1 FROM portal_admins a JOIN portal_users u ON u.id=a.user_id JOIN "session" s ON s."userId"=u.external_id WHERE a.user_id=$1 AND a.is_active AND s.id=$2 AND s."expiresAt">now() FOR SHARE OF a,u,s`,[actor.admin.id,actor.session.session.id]);
 if(!ok.rowCount)throw assignmentError("admin_changed","Administrator access changed. Sign in again.",403);
 if((await d.query("SELECT to_regclass('portal_internal_users') relation")).rows[0].relation&&(await d.query("SELECT 1 FROM portal_internal_users WHERE user_id=$1",[actor.admin.id])).rowCount)throw assignmentError("admin_required","AOC administrator access required.",403);
 if(client){if(!(await d.query("SELECT 1 FROM portal_clients WHERE id=$1 FOR SHARE",[client])).rowCount)throw assignmentError("client_unavailable","Client unavailable.",404);await d.query("SELECT pg_advisory_xact_lock(hashtextextended('document-delivery:'||$1,202))",[client]);}
 const result=await work(d);await d.query("COMMIT");return result;
 }catch(e){await d.query("ROLLBACK");throw e;}finally{d.release();}
}
