import {resolveAdminContext,adminErrorResponse} from "@/lib/admin-data";
import {assertTrustedOrigin,readJsonRequest,requestSecurityErrorResponse} from "@/lib/request-security";
import {databasePool} from "@/lib/database";
import {readCreditPricingAdmin,saveCreditPricing,allocateReportingCredits,CreditsConflict} from "@/lib/credits-repository";
import {previewCreditPricing} from "@/lib/credits-pricing";
import {validateCreditAdjustment} from "@/lib/credits-pricing";
import {readAdminCreditReport} from "@/lib/admin-credit-report";
import {previewAllowanceAdjustment} from "@/lib/admin-credit-pricing";

export const runtime="nodejs";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function failure(error) {
  const security=requestSecurityErrorResponse(error);
  if(security) {security.headers.set("Cache-Control","private, no-store");return security;}
  if(error?.publicDetails) {const response=adminErrorResponse(error);response.headers.set("Cache-Control","private, no-store");return response;}
  if(error instanceof TypeError)return Response.json({error:error.message},{status:400,headers});
  if(error instanceof CreditsConflict)return Response.json({error:error.message},{status:409,headers});
  return Response.json({error:["42P01","42703"].includes(error?.code)?"AI Credits schema needs an update. Review and run npm run credits:migrate against the intended database."
    :"AI Credits settings could not be processed. No payment was collected."},{status:503,headers});
}
export async function GET(request) {
  try {await resolveAdminContext(request.headers);const query=new URL(request.url).searchParams;
    return Response.json(query.has("clientId")?await readAdminCreditReport(databasePool,query.get("clientId"),query.get("month") || undefined):await readCreditPricingAdmin(databasePool),{headers});}
  catch(error){return failure(error);}
}
export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const {admin}=await resolveAdminContext(request.headers);
    const input=await readJsonRequest(request,3000);
    if(input.action==="preview")return Response.json(previewCreditPricing(input,input.apiCostUsd),{headers});
    if(input.action==="adjustment_preview") {
      const adjustment=validateCreditAdjustment(input);
      const report=await readAdminCreditReport(databasePool,adjustment.clientId,input.period);
      if(!report.ready)return Response.json({error:"Credit reporting is not configured."},{status:503,headers});
      return Response.json(previewAllowanceAdjustment(report,adjustment.amount),{headers});
    }
    if(input.action==="pricing")return Response.json({pricing:await saveCreditPricing(databasePool,input,admin.id),mode:"reporting_only"},{headers});
    if(input.action==="allocation")return Response.json(await allocateReportingCredits(databasePool,input,admin.id),{headers});
    return Response.json({error:"Choose pricing, preview or allowance adjustment."},{status:400,headers});
  } catch(error){return failure(error);}
}
