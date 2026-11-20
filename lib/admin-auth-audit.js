import 'server-only';
import {randomUUID} from 'node:crypto';
import {databasePool} from './database.js';
import {resolveAdminContext} from './admin-data.js';
import {assertNotInternalUser} from './internal-user-access.js';
import {appendAdminOperation} from './admin-operation-store.js';
import {safeAuditCode,auditLocation} from './admin-audit-policy.js';

// Better Auth owns credentials and sessions. This observes AOC admin login/logout only.
// Failed attempts are unverified requests against an admin account, never attributed to its owner.
export async function auditAdminAuthentication(request,handler){
 const route=new URL(request.url).pathname,signIn=/\/sign-in\/(username|email)$/.test(route),signOut=route.endsWith('/sign-out');
 if(request.method!=='POST'||(!signIn&&!signOut))return handler(request);
 let admin=null,externalId=null;
 try{
  if(signOut){admin=(await resolveAdminContext(request.headers)).admin;}
  else{
   const size=Number(request.headers.get('content-length')||0);if(size>4096)return handler(request);
   const input=await request.clone().json(),identity=route.endsWith('username')?input.username:input.email;
   if(typeof identity!=='string'||identity.length>254)return handler(request);
   const column=route.endsWith('username')?'username':'email';
   const row=(await databasePool.query(`SELECT p.id::text,p.external_id,p.display_name FROM portal_users p JOIN portal_admins a ON a.user_id=p.id AND a.is_active=TRUE JOIN "user" u ON u.id=p.external_id WHERE LOWER(u."${column}")=LOWER($1) LIMIT 1`,[identity])).rows[0];
   if(row){await assertNotInternalUser(row.external_id);admin={id:row.id,name:row.display_name||'AOC Administrator'};externalId=row.external_id;}
  }
 }catch{/* Non-AOC and Internal authentication retain their independent behavior. */}
 if(!admin)return handler(request);
 const requestId=randomUUID(),start=Date.now();
 const base={requestId,phase:'finished',origin:'auth',operation:signIn?'admin.auth.sign_in':'admin.auth.sign_out',category:'authentication',method:'POST',route,details:signIn?{target_admin_id:admin.id}:{}};
 let response,error;
 try{response=await handler(request);}catch(e){error=e;}
 let confirmed=false;
 if(!error&&response.ok){if(signOut)confirmed=true;else try{const body=await response.clone().json();confirmed=body?.user?.id===externalId;}catch{/* An MFA step is not a completed login. */}}
 try{await appendAdminOperation(databasePool,{...base,actor:confirmed||signOut?admin:null,status:response?.status||500,duration:Date.now()-start,
  outcome:error?'failed':confirmed?'succeeded':response?.ok?'info':'denied',code:error?safeAuditCode(error.code||error.name):response?.status>=400?'authentication_rejected':null,location:auditLocation(error?.stack),
  summary:error?'The authentication request failed.':confirmed?`Administrator ${signIn?'sign-in':'sign-out'} completed.`:response?.ok?'Authentication requires another step; sign-in is not confirmed.':'An unverified sign-in attempt against an administrator account was rejected.'});}
 catch{console.error('Administrator authentication audit incomplete',{requestId,code:'audit_unavailable'});}
 if(error)throw error;const headers=new Headers(response.headers);headers.set('X-AOC-Audit-Reference',requestId);return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
