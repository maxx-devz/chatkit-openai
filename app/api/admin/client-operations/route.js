import {resolveAdminContext,adminErrorResponse} from "@/lib/admin-data";
import {databasePool} from "@/lib/database";
export const dynamic="force-dynamic";
export async function GET(request) {
  const headers={"Cache-Control":"private, no-store"};
  try {
    await resolveAdminContext(request.headers);
    const clientId=new URL(request.url).searchParams.get("clientId");
    if(!/^[1-9][0-9]{0,18}$/.test(clientId || "") || BigInt(clientId)>9223372036854775807n)return Response.json({error:"Choose a valid client."},{status:400,headers});
    const client=(await databasePool.query("SELECT id FROM portal_clients WHERE id=$1",[clientId])).rows[0];
    if(!client)return Response.json({error:"Client not found."},{status:404,headers});
    const ready=(await databasePool.query("SELECT to_regclass('portal_website_insights_sites') IS NOT NULL AS ready")).rows[0].ready;
    const websites=ready?(await databasePool.query("SELECT name,url FROM portal_website_insights_sites WHERE client_id=$1 AND archived_at IS NULL ORDER BY created_at,id",[clientId])).rows:[];
    return Response.json({clientId,websitesReady:ready,websites},{headers});
  }catch(error){if(error?.publicDetails){const response=adminErrorResponse(error);response.headers.set("Cache-Control","private, no-store");return response;}
    return Response.json({error:"Website integration status could not be loaded."},{status:503,headers});}
}
