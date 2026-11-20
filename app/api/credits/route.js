import {requireClientPermission,portalErrorResponse} from "@/lib/portal-data";
import {databasePool} from "@/lib/database";
import {readClientPlan} from '@/lib/client-plan-store';
import {readClientCredits} from "@/lib/credits-repository";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function GET(request) {
  try {
    const context=await requireClientPermission(request.headers,"client.overview.read");
    if(request.headers.get("x-aoc-client")!==context.client.id)
      return Response.json({error:"Your active account changed. Reload this page."},{status:409,headers});
    const url=new URL(request.url),rawOffset=url.searchParams.get("offset") || "0";
    if(!/^\d{1,5}$/.test(rawOffset))throw new TypeError("Choose a valid transaction page.");
    const plan=await readClientPlan(databasePool,context.client.id,{period:url.searchParams.get("month")||undefined});
    if(plan.ready&&plan.configured)return Response.json({...plan,group:url.searchParams.get("group")||"day",offset:Number(rawOffset)},{headers});
    return Response.json(await readClientCredits(databasePool,context.client.id,{
      period:url.searchParams.get("month") || undefined,group:url.searchParams.get("group") || "day",
      offset:Number(rawOffset),summary:url.searchParams.get("summary")==="1",
      asOf:url.searchParams.get("asOf") || "",
    }),{headers});
  } catch(error) {
    if(error instanceof TypeError)return Response.json({error:error.message},{status:400,headers});
    if(error?.publicDetails) {
      const response=portalErrorResponse(error);response.headers.set("Cache-Control","private, no-store");return response;
    }
    return Response.json({error:"AI Credits could not be loaded. No balance or missing cost has been treated as zero."},{status:503,headers});
  }
}
