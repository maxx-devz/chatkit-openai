import {resolveAdminContext,adminErrorResponse} from '@/lib/admin-data';
import {assertTrustedOrigin,readJsonRequest,requestSecurityErrorResponse} from '@/lib/request-security';
import {databasePool} from '@/lib/database';
import {previewAiUsageClear,clearAiUsageHistory} from '@/lib/ai-usage-clear-repository';
import {verifyUsageClearPreview} from '@/lib/ai-usage-clear-policy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request) {
  try {
    assertTrustedOrigin(request.headers);
    const {admin}=await resolveAdminContext(request.headers);
    const input=await readJsonRequest(request,5000);
    if(input?.action==='preview')return Response.json(await previewAiUsageClear(databasePool,input,admin.id,process.env.BETTER_AUTH_SECRET),{headers});
    if(input?.action==='clear') {
      if(input.confirmation!=='RESET')throw new TypeError('Type RESET to confirm.');
      const plan=verifyUsageClearPreview(input.token,admin.id,process.env.BETTER_AUTH_SECRET);
      return Response.json(await clearAiUsageHistory(databasePool,plan),{headers});
    }
    throw new TypeError('Preview the usage history before clearing it.');
  } catch(error) {
    const known=requestSecurityErrorResponse(error) || (error?.publicDetails?adminErrorResponse(error):null);
    if(known){known.headers.set('Cache-Control','private, no-store');return known;}
    return Response.json({error:error instanceof TypeError || error.usageSetup?error.message:'AI chat history could not be cleared. Retry the same preview; clearing never changes provider charges.'},{status:error instanceof TypeError?400:503,headers});
  }
}
