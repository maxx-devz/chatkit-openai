import assert from 'node:assert/strict';import pg from 'pg';import {randomUUID} from 'node:crypto';
import {appendAdminOperation,appendBrowserOperations,readAdminOperations} from '../lib/admin-operation-store.js';
const url=process.env.ADMIN_AUDIT_TEST_DATABASE_URL;let db;
try{if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname)||!/^\/aoc_documents_[a-f0-9]{10}$/.test(new URL(url).pathname))throw Error('Use a disposable loopback synthetic database.');
 db=new pg.Pool({connectionString:url,max:1});
 const role=(await db.query('SELECT current_user AS name,rolsuper,rolbypassrls FROM pg_roles WHERE rolname=current_user')).rows[0];assert.equal(role.rolsuper,false);assert.equal(role.rolbypassrls,false);
 const requestId=randomUUID(),base={requestId,actor:{id:'1',name:'Synthetic Operator'},clientId:'1',operation:'admin.clients.update',category:'change',method:'PATCH',route:'/api/admin/clients',summary:'Synthetic safe explanation',details:{fields:['portalEnabled'],values:{portalEnabled:true}}};
 await appendAdminOperation(db,{...base,phase:'started',outcome:'started'});let report=await readAdminOperations(db);assert.equal(report.rows.find(e=>e.request_id===requestId).outcome,'started');
 await appendAdminOperation(db,{...base,phase:'finished',outcome:'failed',status:409,code:'23505'});await appendAdminOperation(db,{...base,phase:'finished',outcome:'succeeded',status:200});
 assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM portal_admin_operation_audit WHERE request_id=$1',[requestId])).rows[0].n,2);
 report=await readAdminOperations(db,{clientId:'1',outcome:'failed',actorId:'1',reference:requestId});assert.equal(report.rows.length,1);assert.equal(report.rows[0].outcome,'failed');
 assert.equal((await readAdminOperations(db,{clientId:'2',reference:requestId})).rows.length,0);
 const event={id:requestId,type:'ui.field_change',route:'/admin?token=SECRET',fieldType:'password',value:'SECRET',actor:'999'};
 await appendBrowserOperations(db,{id:'1',name:'Synthetic Operator'},{events:[event]});await appendBrowserOperations(db,{id:'1',name:'Synthetic Operator'},{events:[event]});
 const browser=(await db.query("SELECT * FROM portal_admin_operation_audit WHERE phase='browser'")).rows;assert.equal(browser.length,0);
 for(const sql of ['UPDATE portal_admin_operation_audit SET outcome=\'succeeded\'','DELETE FROM portal_admin_operation_audit'])await assert.rejects(db.query(sql),e=>e.code==='42501');
 for(const name of ['anon','authenticated']){const grant=(await db.query("SELECT has_table_privilege($1,'portal_admin_operation_audit','SELECT') AS can_read,has_table_privilege($1,'portal_admin_operation_audit','INSERT') AS can_insert",[name])).rows[0];assert.equal(grant.can_read,false);assert.equal(grant.can_insert,false);}
 assert.equal((await readAdminOperations(db,{actorId:'9999999999999999999'})).ready,true);
 const batch={events:Array.from({length:25},()=>({id:randomUUID(),type:'ui.click',route:'/admin'}))};
 await appendBrowserOperations(db,{id:'1',name:'Synthetic Operator'},batch);await appendBrowserOperations(db,{id:'1',name:'Synthetic Operator'},batch);
 assert.equal((await db.query("SELECT COUNT(*)::int AS n FROM portal_admin_operation_audit WHERE phase='browser'")).rows[0].n,0);
 const before=(await db.query('SELECT COUNT(*)::int AS n FROM portal_admin_operation_audit')).rows[0].n;
 assert.equal((await appendBrowserOperations(db,{id:'987654321',name:'Unavailable'},batch)).disabled,true);
 assert.equal((await db.query('SELECT COUNT(*)::int AS n FROM portal_admin_operation_audit')).rows[0].n,before);
 await appendAdminOperation(db,{...base,requestId:randomUUID(),phase:'finished',origin:'browser',category:'navigation',method:'UI',outcome:'info'});
 await appendAdminOperation(db,{...base,requestId:randomUUID(),phase:'finished',category:'read',method:'GET',outcome:'succeeded'});
 assert.ok((await readAdminOperations(db)).rows.every(row=>row.origin!=='browser'&&row.method!=='GET'));
 console.log('PASS: actual ordinary runtime role, append-only grants, durable unfinished attempt, failure detail, replay dedupe, client/actor/reference filters, browser/server separation, private input exclusion and pooled reuse.');
}catch(error){console.error('Admin audit database verification failed:',error.code||error.message);process.exitCode=1;}finally{await db?.end();}
