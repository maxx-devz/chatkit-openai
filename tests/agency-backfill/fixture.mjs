import {readFile,writeFile} from 'node:fs/promises';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {applyAgencyMigration} from '../../scripts/migrate-agency-platform.mjs';
import {quoteIdentifier,canonical,digest} from '../../scripts/agency-backfill-plan.mjs';

const root=new URL('../../',import.meta.url);
export const fixtureSchemas=['database/schema.sql','database/admin-schema.sql','database/client-access-schema.sql',
  'database/integration-audit-schema.sql','database/admin-audit-schema.sql','database/ai-cost-schema.sql',
  'database/ai-credits-schema.sql','database/ai-usage-controls.sql','database/drive-source-schema.sql',
  'database/prepared-source-schema.sql','chatkit_backend/schema.sql','chatkit_backend/site_ai_schema.sql',
  'chatkit_backend/usage_schema.sql','chatkit_backend/upload_schema.sql','chatkit_backend/library_schema.sql',
  'chatkit_backend/builder_schema.sql','database/website-insights.sql','database/hubstaff-search-schema.sql'];

export async function databaseSnapshot(db) {
  await db.query("SET timezone='UTC'");
  const {rows:tables}=await db.query(`SELECT n.nspname,c.relname,c.relkind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname IN ('public','agency_platform') AND c.relkind IN ('r','p','S') ORDER BY 1,2`);
  const records=[];
  for(const table of tables) {
    const name=quoteIdentifier(table.nspname)+'.'+quoteIdentifier(table.relname);
    const {rows}=table.relkind==='S'
      ? await db.query(`SELECT last_value::text,is_called,log_cnt::text FROM ${name}`)
      : await db.query(`SELECT encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS fingerprint FROM ${name} t ORDER BY 1`);
    records.push({relation:table.nspname+'.'+table.relname,count:rows.length,digest:digest(rows)});
  }
  const {rows:triggers}=await db.query(`SELECT n.nspname,c.relname,t.tgname,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t
    JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE NOT t.tgisinternal AND n.nspname IN ('public','agency_platform') ORDER BY 1,2,3`);
  return {digest:digest({records,triggers}),records,triggers};
}

export async function prepareLegacyFixture(db,connectionString,outputDirectory) {
  const {rows:[empty]}=await db.query(`SELECT NOT EXISTS(SELECT 1 FROM pg_tables WHERE schemaname IN ('public','agency_platform')) AS empty`);
  if(!empty.empty) throw Error('Stage 04 fixture needs a new empty approved database; never overwrites a snapshot.');
  for(const file of fixtureSchemas) await db.query(await readFile(new URL(file,root),'utf8'));
  await db.query(await readFile(new URL('database/agency-platform/000_role_setup.sql',root),'utf8'));
  await applyAgencyMigration(db);
  await db.query("SET timezone='UTC'");
  await db.query(`INSERT INTO portal_users(id,external_id,display_name,email,created_at,updated_at) VALUES
    (300,'fixture-admin','Fixture AOC Admin','admin@example.invalid','2025-01-01','2025-01-01'),
    (301,'fixture-mira','Fixture AOC User','mira@example.invalid','2025-01-01','2025-01-01'),
    (302,'fixture-ben','Fixture Harbor User','ben@example.invalid','2025-01-01','2025-01-01'),
    (303,'fixture-other-admin','Unreviewed Publisher','other@example.invalid','2025-01-01','2025-01-01'),
    (304,'fixture-inactive','Inactive Fixture','inactive@example.invalid','2025-01-01','2025-01-01');
    SELECT setval('portal_users_id_seq',304);
    INSERT INTO portal_admins(user_id,role,is_active) VALUES(300,'aoc_admin',true),(303,'aoc_admin',true);
    INSERT INTO portal_clients(id,slug,display_name,portal_enabled,ai_enabled,created_at,updated_at) VALUES
    (501,'s04-orchid','Orchid AOC',true,true,'2025-01-01','2025-01-01'),
    (502,'s04-birch','Birch AOC',true,true,'2025-01-01','2025-01-01'),
    (601,'s04-pine','Pine Harbor',true,true,'2025-01-01','2025-01-01'),
    (701,'s04-unreviewed','Unreviewed Legacy',true,true,'2025-01-01','2025-01-01');
    SELECT setval('portal_clients_id_seq',701);
    INSERT INTO portal_memberships(client_id,user_id,role,is_active) VALUES
      (501,301,'client_admin',true),(502,301,'member',true),(601,301,'member',true),
      (701,301,'member',true),(601,302,'member',true),(501,304,'client_viewer',false);
    INSERT INTO portal_knowledge_items(id,client_id,title,content,status,submitted_by,approved_by,created_at,updated_at)
      VALUES(1001,501,'Synthetic legacy knowledge','Fictional AOC client information','approved',301,300,'2025-07-01','2025-07-01');
    INSERT INTO portal_workspace_snapshots(client_id,user_id,workspace,revision,created_at,updated_at)
      VALUES(501,301,'{"fixture":"legacy workspace"}',7,'2025-07-01','2025-07-01');
    INSERT INTO portal_chatkit_threads(client_id,user_id,id,data,chat_mode,created_at) VALUES
      (501,301,'thr_legacy_aoc','{"id":"thr_legacy_aoc","title":"Legacy Work","status":{"type":"active"}}','work','2025-07-02'),
      (501,301,'thr_general_aoc','{"id":"thr_general_aoc","title":"Legacy General","status":{"type":"active"}}','general','2025-07-03'),
      (601,302,'thr_harbor','{"id":"thr_harbor","title":"Fictional Harbor history"}','work','2025-07-02'),
      (501,304,'thr_inactive','{"id":"thr_inactive","title":"Inactive historical conversation"}','work','2025-07-02');
    INSERT INTO portal_chatkit_items(client_id,user_id,thread_id,id,data) VALUES
      (501,301,'thr_legacy_aoc','msg_legacy_user','{"id":"msg_legacy_user","type":"user_message","content":[{"type":"input_text","text":"Synthetic historical question"}]}'),
      (501,301,'thr_legacy_aoc','msg_legacy_reply','{"id":"msg_legacy_reply","type":"assistant_message","content":[{"type":"output_text","text":"Synthetic historical reply"}]}');
    INSERT INTO portal_chatkit_uploads(id,client_id,user_id,thread_id,filename,mime_type,content,created_at)
      VALUES('upload_legacy',501,301,'thr_legacy_aoc','fixture.txt','text/plain',convert_to('Synthetic legacy bytes','UTF8'),'2025-07-02');
    INSERT INTO portal_client_library(id,client_id,submitted_by,source_type,title,extracted_text,index_status,created_at,updated_at) VALUES
      ('lib_aoc',501,301,'note','Legacy AOC document','Synthetic AOC document','not_applicable','2025-07-02','2025-07-02'),
      ('lib_harbor',601,302,'note','Harbor private document','Fictional Harbor content','not_applicable','2025-07-02','2025-07-02');
    INSERT INTO portal_ai_credentials(provider,encrypted_key,key_suffix,updated_by) VALUES('openai','synthetic-not-an-api-credential','TEST','fixture');
    INSERT INTO portal_ai_active_provider(id,provider,updated_by) VALUES(1,'openai','fixture');
    INSERT INTO portal_site_ai_settings(provider,model,updated_by) VALUES('openai','synthetic-model','fixture');
    INSERT INTO portal_drive_source_connections(owner_id,google_email,google_subject,oauth_client_id,root_folder_id,encrypted_refresh_token,connected_at)
      VALUES(300,'admin@example.invalid','synthetic-subject','synthetic-oauth-app','synthetic-root','synthetic-not-a-token','2025-07-01');
    INSERT INTO portal_prepared_source_indexes(owner_id,binding,encrypted_documents,checked_at)
      VALUES(300,'synthetic-binding','synthetic-cache-container',NOW());
    INSERT INTO portal_source_publications(owner_id,audience,client_id,enabled,reference_paths,additional_instructions,updated_at) VALUES
      (300,'clients',NULL,true,'["Synthetic/AOC/Guide"]','Fictional AOC guidance','2025-07-01'),
      (300,'admin',NULL,true,'[]','Private synthetic admin guidance','2025-07-01'),
      (303,'client:501',501,true,'[]','Unreviewed publisher content','2025-07-01'),
      (300,'client:701',701,true,'[]','Unapproved legacy-client content','2025-07-01');
    CREATE TABLE portal_legacy_fixture_notes(id bigint PRIMARY KEY,client_id bigint,body text NOT NULL);
    INSERT INTO portal_legacy_fixture_notes VALUES(901,999999,'Intentionally orphaned synthetic legacy row'),(902,501,'Unreviewed legacy relation');`);
  const oldRequest=randomUUID(),newRequest=randomUUID(),reset=randomUUID();
  await db.query(`INSERT INTO portal_ai_usage_events(request_id,client_id,actor_user_id,action,provider,model,status,input_tokens,output_tokens,total_tokens,started_at,cleared_at,cleared_by,clear_operation)
    VALUES($1,501,301,'client_ai.reply','openai','synthetic-model','succeeded',10,20,30,'2025-07-02','2025-07-15',300,$3),
      ($2,501,301,'client_ai.reply','openai','synthetic-model','succeeded',10,20,30,'2025-07-20',NULL,NULL,NULL)`,[oldRequest,newRequest,reset]);
  await db.query(`INSERT INTO portal_ai_usage_resets(client_id,period,reset_before,operation_id,actor_user_id)
    VALUES(501,'2025-07','2025-07-15',$1,300)`,[reset]);
  await db.query(`INSERT INTO portal_ai_cost_events(event_key,request_id,client_id,provider,model,kind,status,basis,amount_usd,input_tokens,output_tokens,cached_tokens,reason,occurred_at,cleared_at,cleared_by,clear_operation) VALUES
    ('cost-old',$1,501,'openai','synthetic-model','chat','succeeded','estimated',0.01,10,20,0,'fixture','2025-07-02','2025-07-15',300,$3),
    ('cost-new',$2,501,'openai','synthetic-model','chat','succeeded','estimated',0.01,10,20,0,'fixture','2025-07-20',NULL,NULL,NULL),
    ('cost-archived',$4,NULL,'openai','synthetic-model','unreported','failed','unknown',NULL,NULL,NULL,NULL,'archived-owner-unresolved','2025-07-01',NULL,NULL,NULL)`,[oldRequest,newRequest,reset,randomUUID()]);
  await db.query("UPDATE portal_ai_cost_state SET started_at='2025-07-01' WHERE id=1");
  await db.query(`INSERT INTO portal_ai_credit_pricing(id,pricing_type,aoc_fee,credits_per_usd,effective_period,created_by,request_key,created_at) VALUES
      (11,'fixed',1,100,'2025-01','fixture',$1,'2025-01-01'),(12,'percentage',5,100,'2025-08','fixture',$2,'2025-07-01')`,[randomUUID(),randomUUID()]);
  await db.query(`
    INSERT INTO portal_ai_credit_periods(client_id,period,pricing_id,opened_at) VALUES(501,'2025-07',11,'2025-07-01');
    INSERT INTO portal_ai_credit_entries(entry_key,client_id,period,kind,pricing_id,credits,basis,occurred_at,recorded_at)
      VALUES('legacy-allocation',501,'2025-07','allocation',11,100,'manual','2025-07-01','2025-07-01');
    INSERT INTO portal_ai_credit_entries(entry_key,client_id,period,kind,source_event_key,pricing_id,credits,api_cost_usd,aoc_fee_usd,basis,occurred_at,recorded_at)
      VALUES('legacy-usage',501,'2025-07','usage','cost-new',11,-1,0.01,0,'estimated','2025-07-20','2025-07-20');`);
  const harbor=(await db.query("INSERT INTO agency_platform.agencies(slug,display_name) VALUES('harbor-fixture','Fictional Harbor Agency') RETURNING id::text")).rows[0].id;
  await db.query("INSERT INTO agency_platform.client_ownership(client_id,agency_id) VALUES(601,$1)",[harbor]);
  await db.query("INSERT INTO agency_platform.memberships(agency_id,user_id,role) VALUES($1,302,'staff')",[harbor]);
  await db.query("INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level) VALUES($1,601,302,'contribute')",[harbor]);
  const legacyRole='aoc_s04_legacy_'+randomBytes(6).toString('hex'),password=randomBytes(32).toString('hex');
  await db.query(`CREATE ROLE ${quoteIdentifier(legacyRole)} LOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '${password}'`);
  await db.query(`GRANT USAGE ON SCHEMA public TO ${quoteIdentifier(legacyRole)}`);
  await db.query(`GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA public TO ${quoteIdentifier(legacyRole)}`);
  await db.query(`GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA public TO ${quoteIdentifier(legacyRole)}`);
  const legacyUrl=new URL(connectionString);legacyUrl.username=legacyRole;legacyUrl.password=password;
  const manifest={version:1,clientIds:['501','502'],agencyAdminUserIds:['300'],operatorUserId:'300',
    companyGuidance:[{owner_id:'300',audience:'clients'}],approvalReference:'synthetic-stage04-reviewed',legacyAppRole:legacyRole};
  await writeFile(new URL('manifest.json',outputDirectory),canonical(manifest)+'\n',{flag:'wx'});
  await writeFile(new URL('.env.agency-stage04-flows',root),'# Private synthetic legacy application login.\nDATABASE_URL='+legacyUrl.href+'\n',{flag:'wx'});
  return {manifest,harborAgencyId:harbor,legacyRole};
}

export async function assertLegacyHistory(db,expected) {
  const current=await databaseSnapshot(db);
  const legacy=current.records.filter(r=>r.relation.startsWith('public.'));
  const prior=expected.records.filter(r=>r.relation.startsWith('public.'));
  if(canonical(legacy)!==canonical(prior)) throw Error('Legacy rows or sequences changed during ownership migration.');
  return {legacyTables:legacy.length,legacyFingerprint:createHash('sha256').update(canonical(legacy)).digest('hex')};
}
