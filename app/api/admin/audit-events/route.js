import {resolveAdminContext,adminErrorResponse} from '@/lib/admin-data';
import {databasePool} from '@/lib/database';
import {assertTrustedOrigin,requestSecurityErrorResponse} from '@/lib/request-security';
import {readAdminOperations} from '@/lib/admin-operation-store';
export const runtime='nodejs';export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store','Vary':'Cookie','X-Content-Type-Options':'nosniff'};
function failure(error){const response=requestSecurityErrorResponse(error)||(error?.publicDetails?adminErrorResponse(error):Response.json({error:'Activity recording is unavailable. Check the audit migration and runtime permissions.'},{status:503,headers}));for(const [name,value] of Object.entries(headers))response.headers.set(name,value);return response;}
// Telemetry transport is deliberately excluded from request auditing to prevent recursion.
export async function GET(request){try{await resolveAdminContext(request.headers);return Response.json(await readAdminOperations(databasePool,Object.fromEntries(new URL(request.url).searchParams)),{headers});}catch(error){return failure(error);}}
export async function POST(request){try{assertTrustedOrigin(request.headers);await resolveAdminContext(request.headers);return Response.json({accepted:0,disabled:true},{headers});}catch(error){return failure(error);}}
