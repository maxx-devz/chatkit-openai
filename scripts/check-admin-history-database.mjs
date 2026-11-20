import pg from 'pg';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {appendAdminOperation} from '../lib/admin-operation-store.js';
import {attachAdminHistoryResponses} from '../lib/admin-history-store.js';
import {createAdminAuditedHandler} from '../lib/admin-operation-runner.js';
import {authorizeAdminAudit,noteAdminLegacyEvent,noteAdminAuditClient,noteAdminAuditSaved} from '../lib/admin-audit-context.js';
import {recordPortalAuditEvent} from '../lib/portal-audit.js';
const url=process.env.ADMIN_AUDIT_TEST_DATABASE_URL;let db;
try{
 if(!url||!['127.0.0.1','localhost'].includes(new URL(url).hostname)||!/^aoc_documents_[a-f0-9]{10}$/.test(new URL(url).pathname.slice(1)))throw Error('Use the disposable synthetic database.');
 db=new pg.Pool({connectionString:url,max:1});const source=await readFile(new URL('../lib/admin-data.js',import.meta.url),'utf8');
 const create=source.split('const createdAuditRows=await sql`')[1]?.split('`;')[0];
 const update=source.slice(source.indexOf('export async function updateAdminClient'),source.indexOf('export async function createAdminClient')).split('const rows = await sql`')[1]?.split('`;')[0];
 assert.ok(create&&update,'Exercise the current SQL templates, not copied migration behavior.');
 async function query(template,bindings){const values=[],parts=template.split('${');let text=parts.shift();for(const part of parts){const end=part.indexOf('}'),name=part.slice(0,end);if(end<0||!Object.hasOwn(bindings,name))throw Error('Unexpected SQL binding: '+name);values.push(bindings[name]);text+='$'+values.length+part.slice(end+1);}return db.query(text,values);}
 const bindings={username:'history-synthetic',displayName:'Synthetic History Client','approvedWebsiteUrl || null':null,'hubstaffProjectUrl || null':null,hubstaffMonthlyHoursLimit:null,authUserId:'history-synthetic-auth',email:'history@example.invalid','admin.id':'1'};
 let created,clientId;
 const createHandler=createAdminAuditedHandler('admin.clients',async()=>{await authorizeAdminAudit({id:'1',name:'Synthetic Operator'});created=(await query(create,bindings)).rows[0];noteAdminLegacyEvent('action',created.audit_event_id);noteAdminAuditSaved(created);noteAdminLegacyEvent('access',created.access_event_id);clientId=(await db.query('SELECT id::text FROM portal_clients WHERE slug=$1',[bindings.username])).rows[0].id;noteAdminAuditClient(clientId);return Response.json({ok:true},{status:201});},{append:e=>appendAdminOperation(db,e)});
 assert.equal((await createHandler(new Request('http://portal.test/api/admin/clients',{method:'POST'}))).status,201);
 const rows=[{kind:'action',id:created.audit_event_id,actor_user_id:'1',client_id:clientId},{kind:'access',id:created.access_event_id,actor_user_id:'1',client_id:clientId}];
 let enriched=await attachAdminHistoryResponses(db,rows);assert.equal(enriched[0].request_details.http_status,201);assert.equal(enriched[1].request_details.request_id,enriched[0].request_details.request_id);
 assert.equal((await attachAdminHistoryResponses(db,[{...rows[0],actor_user_id:'999'}]))[0].request_details,undefined);assert.equal((await attachAdminHistoryResponses(db,[{...rows[0],client_id:'2'}]))[0].request_details,undefined);
 let updated;
 const updateHandler=createAdminAuditedHandler('admin.clients',async()=>{await authorizeAdminAudit({id:'1',name:'Synthetic Operator'});updated=(await query(update,{slug:bindings.username,displayName:'Synthetic History Updated','vectorStoreId || null':null,'approvedWebsiteUrl || null':null,'hubstaffProjectUrl || null':null,hubstaffMonthlyHoursLimit:null,'admin.id':'1','settings.portalEnabled':true,'settings.aiEnabled':true})).rows[0];noteAdminLegacyEvent('action',updated.audit_event_id);noteAdminAuditSaved(updated);noteAdminAuditClient(clientId);return Response.json({ok:true});},{append:e=>appendAdminOperation(db,e)});
 await updateHandler(new Request('http://portal.test/api/admin/clients',{method:'PATCH'}));enriched=await attachAdminHistoryResponses(db,[{...rows[0],id:updated.audit_event_id}]);assert.equal(enriched[0].request_details.http_status,200);
 const readHandler=createAdminAuditedHandler('admin.audit',async()=>{await authorizeAdminAudit({id:'1',name:'Synthetic Operator'});await recordPortalAuditEvent(db,{audience:'aoc_admin',actorUserId:'1',action:'aoc.provider.update',targetType:'provider'});return Response.json({ok:true});},{append:e=>appendAdminOperation(db,e)});
 await readHandler(new Request('http://portal.test/api/admin/provider-settings',{method:'PUT'}));const readId=(await db.query("SELECT id::text FROM portal_audit_events WHERE action='aoc.provider.update' ORDER BY id DESC LIMIT 1")).rows[0].id;
 assert.equal((await attachAdminHistoryResponses(db,[{kind:'action',id:readId,actor_user_id:'1',client_id:null}]))[0].request_details.http_status,200);
 const oldId=(await db.query("INSERT INTO portal_audit_events(audience,actor_user_id,action,target_type) VALUES('aoc_admin',1,'aoc.audit.read','audit') RETURNING id::text")).rows[0].id;
 assert.equal((await attachAdminHistoryResponses(db,[{kind:'action',id:oldId,actor_user_id:'1',client_id:null}]))[0].request_details,undefined,'No matching by timestamps, action name or actor alone.');
 console.log('PASS: actual create/update SQL captures legacy event IDs; exact 201/200 request links; paired access grant; actor/client mismatch denial; generic audit writer correlation; older records remain unknown. Synthetic disposable data only.');
}catch(error){console.error('Historical audit database verification failed:',error.code||error.message);process.exitCode=1;}finally{await db?.end();}
