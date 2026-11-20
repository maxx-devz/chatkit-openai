import 'server-only';
import {databasePool} from './database.js';
import {appendAdminOperation} from './admin-operation-store.js';
import {createAdminAuditedHandler} from './admin-operation-runner.js';
export const withAdminAudit=(operation,handler)=>createAdminAuditedHandler(operation,handler,{
 append:event=>appendAdminOperation(databasePool,event),
 report:({requestId,code})=>console.error('Admin audit recording incomplete',{requestId,code}),
});
