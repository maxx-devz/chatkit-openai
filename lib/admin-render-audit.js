import 'server-only';
import {randomUUID} from 'node:crypto';
import {resolveAdminContext} from './admin-data.js';
import {databasePool} from './database.js';
import {appendAdminOperation} from './admin-operation-store.js';
import {safeAuditCode,auditLocation,safeAuditRoute} from './admin-audit-policy.js';
export async function reportAdminRenderError(error,request){
 if(!['POST','PUT','PATCH','DELETE'].includes(request.method))return;
 const route=safeAuditRoute(request.path||'');if(!/^\/admin(?:\/|$)/.test(request.path?.split('?')[0]||''))return;
 const requestId=randomUUID();try{const {admin}=await resolveAdminContext(new Headers(request.headers));
  await appendAdminOperation(databasePool,{requestId,phase:'finished',actor:admin,operation:'admin.page.error',category:'error',outcome:'failed',method:request.method||'GET',route,status:500,
   code:safeAuditCode(error?.code||error?.name),location:auditLocation(error?.stack),summary:'The admin page could not finish rendering. Use this reference and code location to investigate.'});
 }catch{console.error('Admin page error audit unavailable',{requestId,code:'audit_unavailable'});}
}
