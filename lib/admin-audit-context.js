import {safeChangeValues} from './admin-change-policy.js';
import {AsyncLocalStorage} from 'node:async_hooks';
import {safeAuditCode,auditLocation} from './admin-audit-policy.js';
const context=new AsyncLocalStorage();
export const runAdminAuditContext=(state,work)=>context.run(state,work);
export async function authorizeAdminAudit(admin){const state=context.getStore();if(state){if(state.admin&&String(state.admin.id)!==String(admin.id))throw new Error('Audit actor changed');state.admin=admin;state.beginPromise||=state.begin(admin);await state.beginPromise;}}
export function noteAdminAuditError(error){const state=context.getStore();if(state&&state.notes.length<5)state.notes.push({code:safeAuditCode(error?.publicDetails?.code||error?.code||error?.name),location:auditLocation(error?.stack)});}

export function noteAdminAuditOutcome(outcome,code){const state=context.getStore();if(state&&['failed','denied','cancelled'].includes(outcome)){state.outcome=outcome;if(code)state.notes.push({code:safeAuditCode(code)});}}
export function noteAdminAuditClient(id){const state=context.getStore();if(state&&/^[1-9][0-9]{0,18}$/.test(String(id||''))&&BigInt(id)<=9223372036854775807n)state.clientId=String(id);}

// Link committed legacy row identifiers to their actual server request; never guess by time.
export function noteAdminLegacyEvent(kind,id){const state=context.getStore();if(!state?.admin||!['action','access'].includes(kind)||!/^[1-9][0-9]{0,18}$/.test(String(id||''))||BigInt(id)>9223372036854775807n)return;
 state.legacyEvents||=[];const value={kind,id:String(id)};if(state.legacyEvents.length<40&&!state.legacyEvents.some(e=>e.kind===kind&&e.id===value.id))state.legacyEvents.push(value);
}

export function noteAdminAuditSaved(values){const state=context.getStore();if(!state?.admin)return;const safe=safeChangeValues(values);if(Object.keys(safe).length)state.savedValues={...state.savedValues,...safe};}
