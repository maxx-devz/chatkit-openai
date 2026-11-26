import {withAdminAudit} from '@/lib/admin-audited-handler';
import {resolveAdminContext,adminErrorResponse} from '@/lib/admin-data';
import {loadOpenAIOrganizationUsage} from '@/lib/openai-organization-usage-server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export const maxDuration=30;
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
async function auditGET(request){
 try{
  await resolveAdminContext(request.headers);
  const params=new URL(request.url).searchParams;
  if([...params.keys()].some(name=>name!=='month')||params.getAll('month').length>1)throw new TypeError();
  const report=await loadOpenAIOrganizationUsage(params.get('month')||undefined);
  // Membership/role revocation during a provider round-trip must also deny.
  await resolveAdminContext(request.headers);
  return Response.json(report,{headers});
 }catch(error){
  if(error?.code==='reporting_connection_changed')return Response.json({error:'The OpenAI connection changed. Refresh to load the current project report.',code:'reporting_connection_changed'},{status:409,headers});
  if(error instanceof TypeError)return Response.json({error:'Choose one current or past UTC month. Reporting scope is configured on the server.'},{status:400,headers});
  if(error?.publicDetails){const response=adminErrorResponse(error);for(const [key,value] of Object.entries(headers))response.headers.set(key,value);return response;}
  return Response.json({error:'OpenAI reporting could not be loaded. No missing costs or tokens are assumed to be zero.'},{status:503,headers});
 }
}

export const GET=withAdminAudit('admin.openai_usage',auditGET);
