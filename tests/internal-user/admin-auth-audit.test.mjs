import {test,mock} from 'node:test';import assert from 'node:assert/strict';
let adminAllowed=true,internal=false,known=true;const events=[];
mock.module('../../lib/database.js',{namedExports:{databasePool:{query:async()=>({rows:known?[{id:'1',external_id:'aoc-test',display_name:'Synthetic Operator'}]:[]})}}});
mock.module('../../lib/admin-data.js',{namedExports:{resolveAdminContext:async()=>{if(!adminAllowed)throw Error('not admin');return {admin:{id:'1',name:'Synthetic Operator'}};}}});
mock.module('../../lib/internal-user-access.js',{namedExports:{assertNotInternalUser:async()=>{if(internal)throw Error('Internal only');}}});
mock.module('../../lib/admin-operation-store.js',{namedExports:{appendAdminOperation:async(_db,event)=>events.push(event)}});
const {auditAdminAuthentication}=await import('../../lib/admin-auth-audit.js');
const req=(path='sign-in/username')=>new Request('http://portal.test/api/auth/'+path,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({username:'synthetic',password:'SECRET-PASSWORD'})});
test('AOC sign-in audit confirms Better Auth identity and never records credentials or session token',async()=>{
 events.length=0;const response=await auditAdminAuthentication(req(),async()=>Response.json({user:{id:'aoc-test'},token:'SECRET-TOKEN'}));assert.equal(response.status,200);assert.equal(events.length,1);assert.equal(events[0].actor.id,'1');assert.equal(events[0].outcome,'succeeded');assert.ok(!JSON.stringify(events).includes('SECRET'));
});
test('Failed login is an unverified attempt, never an action attributed to the account owner; pending MFA is not a completed login',async()=>{
 events.length=0;await auditAdminAuthentication(req(),async()=>Response.json({error:'Rejected'},{status:401}));assert.equal(events[0].actor,null);assert.equal(events[0].outcome,'denied');assert.equal(events[0].details.target_admin_id,'1');
 events.length=0;await auditAdminAuthentication(req(),async()=>Response.json({twoFactorRedirect:true}));assert.equal(events[0].actor,null);assert.equal(events[0].outcome,'info');
});
test('Client and Internal authentication retain independent behavior and do not enter AOC admin logs',async()=>{
 events.length=0;known=false;await auditAdminAuthentication(req(),async()=>Response.json({ok:true}));assert.equal(events.length,0);known=true;internal=true;await auditAdminAuthentication(req(),async()=>Response.json({ok:true}));assert.equal(events.length,0);internal=false;
 adminAllowed=false;await auditAdminAuthentication(req('sign-out'),async()=>Response.json({ok:true}));assert.equal(events.length,0);adminAllowed=true;
});
test('Sign-out audit is attributed only after the existing active AOC admin check',async()=>{
 events.length=0;await auditAdminAuthentication(req('sign-out'),async()=>Response.json({ok:true}));assert.equal(events[0].operation,'admin.auth.sign_out');assert.equal(events[0].actor.id,'1');assert.equal(events[0].outcome,'succeeded');
});
