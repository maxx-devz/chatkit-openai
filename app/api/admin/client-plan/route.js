import {noteAdminAuditError} from '@/lib/admin-audit-context';
import {withAdminAudit} from '@/lib/admin-audited-handler';
import {resolveAdminContext,adminErrorResponse} from '@/lib/admin-data';
import {databasePool} from '@/lib/database';
import {assertTrustedOrigin,readJsonRequest,requestSecurityErrorResponse} from '@/lib/request-security';
import {readClientPlan,mutateClientPlan,PlanConflict} from '@/lib/client-plan-store';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
function failure(error){noteAdminAuditError(error);const response=requestSecurityErrorResponse(error)||(error?.publicDetails?adminErrorResponse(error):null);if(response){response.headers.set('Cache-Control','private, no-store');return response;}return Response.json({error:error instanceof TypeError||error instanceof PlanConflict?error.message:'Client plans could not be processed. Check the client-plans database setup; no payment is collected by this portal.'},{status:error instanceof TypeError?400:error instanceof PlanConflict?409:503,headers});}
async function auditGET(request){try{await resolveAdminContext(request.headers);const params=new URL(request.url).searchParams;
 if(!params.has('clientId'))return Response.json({clients:(await databasePool.query('SELECT id::text,display_name AS name FROM portal_clients ORDER BY display_name,id')).rows},{headers});
 return Response.json(await readClientPlan(databasePool,params.get('clientId'),{admin:true,period:params.get('month')||undefined}),{headers});
}catch(error){return failure(error);}}
async function auditPOST(request){try{assertTrustedOrigin(request.headers);const {admin}=await resolveAdminContext(request.headers);
 return Response.json(await mutateClientPlan(databasePool,await readJsonRequest(request,4000),admin.id),{headers});
}catch(error){return failure(error);}}

export const GET=withAdminAudit("admin.client_plan",auditGET);

export const POST=withAdminAudit("admin.client_plan",auditPOST);
