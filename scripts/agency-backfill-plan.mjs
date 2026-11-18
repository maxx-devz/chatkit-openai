import { createHash } from 'node:crypto';

export const quoteIdentifier = value => '"'+String(value).replaceAll('"','""')+'"';
export const canonical = value => JSON.stringify(value,(_,v)=>v && !Array.isArray(v) && typeof v==='object'
  ? Object.fromEntries(Object.entries(v).sort(([a],[b])=>a.localeCompare(b))) : v);
export const digest = value => createHash('sha256').update(typeof value==='string'?value:canonical(value)).digest('hex');
export const recordRef = (relation,key) => relation+':'+digest(key).slice(0,20);
const id = value => typeof value==='string' && /^[1-9][0-9]{0,18}$/.test(value) && BigInt(value)<=9223372036854775807n;

export function validateManifest(input) {
  if(input?.version!==1 || !Array.isArray(input.clientIds) || !input.clientIds.length
    || !input.clientIds.every(id) || new Set(input.clientIds).size!==input.clientIds.length
    || !id(input.operatorUserId) || !Array.isArray(input.agencyAdminUserIds)
    || !input.agencyAdminUserIds.every(id) || !input.agencyAdminUserIds.includes(input.operatorUserId)
    || !Array.isArray(input.companyGuidance) || input.companyGuidance.some(k=>!id(k.owner_id) || k.audience!=='clients')
    || typeof input.approvalReference!=='string' || input.approvalReference.length<1 || input.approvalReference.length>120
    || typeof input.legacyAppRole!=='string' || !/^[a-z][a-z0-9_]{1,62}$/.test(input.legacyAppRole)) {
    throw new TypeError('An approved version-1 AOC client/source manifest is required. Keep record identifiers private.');
  }
  return input;
}

const privateRelations = new Set(['portal_users','portal_admins','portal_ai_credentials','portal_ai_active_provider',
  'portal_site_ai_settings','portal_hubstaff_tokens','portal_ai_cost_state','portal_ai_credit_pricing',
  'portal_prepared_source_indexes','portal_drive_source_connections','portal_drive_source_oauth_states']);
const knownClientRelations = new Set(['portal_clients','portal_memberships','portal_workspace_snapshots','portal_knowledge_items',
  'portal_client_access_audit','portal_chatkit_threads','portal_chatkit_items','portal_chatkit_leases',
  'portal_chatkit_uploads','portal_chatkit_upload_attempts','portal_client_library','portal_ai_usage_monthly',
  'portal_ai_activity_monthly','portal_ai_usage_events','portal_ai_cost_events','portal_ai_usage_resets',
  'portal_ai_credit_periods','portal_ai_credit_entries','portal_audit_events','portal_integration_runs',
  'portal_website_insights_sites','portal_website_insights_reports','portal_website_insights_google',
  'portal_website_insights_oauth_states','portal_hubstaff_search_indexes','portal_hubstaff_search_tasks',
  'portal_hubstaff_search_comments','portal_assistant_configs','portal_assistant_versions',
  'portal_assistant_tool_usage','portal_assistant_preview_usage','portal_assistant_files']);

export function relationPolicy(name) {
  if(name==='portal_source_publications') return {kind:'source_pack',access:'agency_source',clientBound:false};
  if(privateRelations.has(name)) return {kind:/credentials|tokens|connections|oauth/.test(name)?'credential':
    /users|admins/.test(name)?'identity':name.includes('pricing')?'billing_reference':'platform_settings',access:'private',clientBound:false};
  if(!knownClientRelations.has(name)) return {kind:'audit_record',access:'private',clientBound:false};
  if(/google|oauth/.test(name)) return {kind:'credential',access:'private',clientBound:true};
  if(/cost|credit|usage|audit|memberships|integration|clients$/.test(name)) return {kind:'billing_reference',access:'private',clientBound:true};
  return {kind:name.includes('website_insights')?'website_report':'generated_asset',
    access:/chatkit|workspace_snapshots/.test(name)?'user_private':'client_shared',clientBound:true};
}

export async function inventoryLegacy(db) {
  const {rows:tables}=await db.query(`SELECT c.relname AS name,
    ARRAY(SELECT a.attname::text FROM pg_index i JOIN unnest(i.indkey) WITH ORDINALITY k(attnum,n) ON true
      JOIN pg_attribute a ON a.attrelid=c.oid AND a.attnum=k.attnum WHERE i.indrelid=c.oid AND i.indisprimary ORDER BY k.n) AS keys
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relname LIKE 'portal\\_%' ESCAPE '\\'
      AND c.relname NOT LIKE 'portal\\_internal\\_%' ESCAPE '\\' ORDER BY c.relname`);
  const result=[];
  for(const table of tables) {
    if(!/^[a-z][a-z0-9_]+$/.test(table.name) || !table.keys.length || table.keys.some(k=>!/^[a-z][a-z0-9_]*$/.test(k))) throw Error('Every inventoried legacy table needs a reviewed stable primary key before adoption.');
    const {rows:fks}=await db.query(`SELECT pn.nspname AS parent_schema,pc.relname AS parent_name,
      array_agg(ca.attname::text ORDER BY k.n) AS child_keys,array_agg(pa.attname::text ORDER BY k.n) AS parent_keys
      FROM pg_constraint con JOIN unnest(con.conkey,con.confkey) WITH ORDINALITY k(ca,pa,n) ON true
      JOIN pg_attribute ca ON ca.attrelid=con.conrelid AND ca.attnum=k.ca
      JOIN pg_attribute pa ON pa.attrelid=con.confrelid AND pa.attnum=k.pa
      JOIN pg_class pc ON pc.oid=con.confrelid JOIN pg_namespace pn ON pn.oid=pc.relnamespace
      WHERE con.contype='f' AND con.conrelid=$1::regclass GROUP BY con.oid,pn.nspname,pc.relname`,['public.'+table.name]);
    const keys=table.keys.flatMap(k=>["'"+k+"'",`to_jsonb(t)->>'${k}'`]).join(',');
    const checks=fks.map(fk=>{
      if([...fk.child_keys,...fk.parent_keys].some(k=>!/^[a-z][a-z0-9_]*$/.test(k))) throw Error('Review nonstandard foreign-key columns before adoption.');
      const parent=quoteIdentifier(fk.parent_schema)+'.'+quoteIdentifier(fk.parent_name);
      return `(${fk.child_keys.map(k=>`to_jsonb(t)->>'${k}' IS NULL`).join(' OR ')} OR EXISTS(SELECT 1 FROM ${parent} p WHERE ${fk.child_keys.map((k,i)=>`to_jsonb(t)->>'${k}'=to_jsonb(p)->>'${fk.parent_keys[i]}'`).join(' AND ')}))`;
    });
    const fields=['client_id','user_id','owner_id','audience','role','is_active'];
    const meta=fields.flatMap(k=>["'"+k+"'",`to_jsonb(t)->>'${k}'`]).join(',');
    const {rows}=await db.query(`SELECT jsonb_build_object(${keys}) AS key,jsonb_build_object(${meta}) AS meta,
      encode(sha256(convert_to(to_jsonb(t)::text,'UTF8')),'hex') AS fingerprint,
      ${checks.length?checks.join(' AND '):'true'} AS parents_ok FROM public.${quoteIdentifier(table.name)} t`);
    rows.sort((a,b)=>canonical(a.key).localeCompare(canonical(b.key)));
    result.push({...table,policy:relationPolicy(table.name),rows});
  }
  return result;
}

export function classifyLegacyRow(table,row,context) {
  const hold = reason=>({scope:'quarantined',agency:null,client:null,reason});
  if(!row.parents_ok) return hold('orphan_reference');
  if(table.name==='portal_source_publications') {
    if(row.meta.client_id) {
      const agency=context.owners.get(row.meta.client_id);
      if(!agency) return hold(context.clients.has(row.meta.client_id)?'unapproved_client':'orphan_client');
      if(agency!==context.aoc || !context.admins.has(row.meta.owner_id)) return hold('unapproved_source_owner');
      return {scope:'client',agency,client:row.meta.client_id,reason:'client_publication'};
    }
    if(row.meta.audience==='admin') return {scope:'platform_private',agency:null,client:null,reason:'private_admin_source'};
    if(context.guidance.has(canonical(row.key))) return {scope:'agency',agency:context.aoc,client:null,reason:'approved_aoc_guidance'};
    return hold('source_review_required');
  }
  if(privateRelations.has(table.name)) return {scope:'platform_private',agency:null,client:null,reason:'explicit_platform_operations'};
  const client=table.name==='portal_clients'?row.key.id:row.meta.client_id;
  if(client && !context.clients.has(client)) return hold('orphan_client');
  if(!knownClientRelations.has(table.name)) return hold('unreviewed_relation');
  if(!client) return hold('archived_or_ambiguous_client');
  const agency=context.owners.get(client);
  if(!agency) return hold('unapproved_client');
  if(table.policy.access==='user_private' && !row.meta.user_id) return hold('missing_user_owner');
  return {scope:'client',agency,client,reason:'client_ownership'};
}

export async function planBackfill(db,input) {
  const manifest=validateManifest(input), tables=await inventoryLegacy(db);
  const clients=new Set(tables.find(t=>t.name==='portal_clients')?.rows.map(r=>r.key.id));
  const {rows:agencies}=await db.query("SELECT id::text,slug FROM agency_platform.agencies");
  const existingAoc=agencies.find(a=>a.slug==='aoc');
  const {rows:owned}=await db.query('SELECT client_id::text,agency_id::text FROM agency_platform.client_ownership');
  const owners=new Map(owned.map(r=>[r.client_id,r.agency_id]));
  const conflicts=[];
  if(!(await db.query('SELECT 1 FROM pg_roles WHERE rolname=$1',[manifest.legacyAppRole])).rowCount) {
    conflicts.push({reference:'compatibility:legacy-app-role',reason:'approved_legacy_app_role_missing'});
  }
  const {rows:[installed]}=await db.query("SELECT to_regclass('agency_platform.backfill_state') IS NOT NULL AS installed");
  let active;
  if(installed.installed) active=(await db.query('SELECT * FROM agency_platform.backfill_state WHERE id=1')).rows[0];
  if(existingAoc && !active && manifest.expectedAgencyId!==existingAoc.id) conflicts.push({reference:'agency:aoc',reason:'existing_agency_requires_confirmation'});
  for(const client of manifest.clientIds) {
    if(!clients.has(client)) conflicts.push({reference:recordRef('portal_clients',{id:client}),reason:'missing_client'});
    else if(owners.has(client) && owners.get(client)!==existingAoc?.id) conflicts.push({reference:recordRef('portal_clients',{id:client}),reason:'foreign_agency_owner'});
    else owners.set(client,existingAoc?.id || '@aoc');
  }
  const users=new Set(tables.find(t=>t.name==='portal_users')?.rows.map(r=>r.key.id));
  const activeAdmins=new Set(tables.find(t=>t.name==='portal_admins')?.rows.filter(r=>r.meta.is_active!=='false').map(r=>r.key.user_id));
  for(const admin of manifest.agencyAdminUserIds) if(!users.has(admin)||!activeAdmins.has(admin)) conflicts.push({reference:recordRef('portal_users',{id:admin}),reason:'operator_admin_not_active'});
  const guidance=new Set(manifest.companyGuidance.map(canonical));
  for(const key of manifest.companyGuidance) if(!manifest.agencyAdminUserIds.includes(key.owner_id)
    || !tables.find(t=>t.name==='portal_source_publications')?.rows.some(r=>canonical(r.key)===canonical(key))) {
    conflicts.push({reference:recordRef('portal_source_publications',key),reason:'guidance_approval_invalid'});
  }
  const context={clients,owners,aoc:existingAoc?.id||'@aoc',admins:new Set(manifest.agencyAdminUserIds),guidance};
  const records=tables.flatMap(table=>table.rows.map(row=>({relation:table.name,key:row.key,meta:row.meta,
    fingerprint:row.fingerprint,policy:table.policy,...classifyLegacyRow(table,row,context)})));
  for(const row of records) if(row.scope==='quarantined' && manifest.clientIds.includes(row.meta.client_id)
    && ['user_private','client_shared'].includes(row.policy.access)) {
    conflicts.push({reference:recordRef(row.relation,row.key),reason:'client_flow_requires_record_resolution'});
  }
  const prior=new Map();
  if(installed.installed) for(const old of (await db.query('SELECT * FROM agency_platform.legacy_ownership')).rows) {
    prior.set(old.relation_name+':'+canonical(old.record_key),old);
  }
  const ownershipActions={create:0,unchanged:0,refresh:0};
  for(const row of records) {
    const old=prior.get(row.relation+':'+canonical(row.key));
    if(!old) ownershipActions.create++;
    else if(old.scope_kind!==row.scope || String(old.agency_id||'')!==String(row.agency||'') || String(old.client_id||'')!==String(row.client||'')) {
      if(old.scope_kind!=='quarantined') conflicts.push({reference:recordRef(row.relation,row.key),reason:'existing_record_lineage_conflict'});
      ownershipActions.refresh++;
    } else if(old.fingerprint!==row.fingerprint) ownershipActions.refresh++;
    else ownershipActions.unchanged++;
  }
  const counts=Object.fromEntries(tables.map(t=>[t.name,{total:0,client:0,agency:0,platform_private:0,quarantined:0}]));
  for(const row of records) { counts[row.relation]??={total:0,client:0,agency:0,platform_private:0,quarantined:0}; counts[row.relation].total++;counts[row.relation][row.scope]++; }
  const sourceDigest=digest(tables.map(t=>({relation:t.name,rows:t.rows.map(r=>({key:r.key,fingerprint:r.fingerprint}))})));
  const manifestDigest=digest(manifest);
  const report={formatVersion:1,agency:'AOC',createAgency:!existingAoc,selectedClients:manifest.clientIds.length,
    totalLegacyRecords:records.length,counts,ownershipActions,conflicts,quarantine:records.filter(r=>r.scope==='quarantined')
      .map(r=>({reference:recordRef(r.relation,r.key),reason:r.reason})),sourceDigest,manifestDigest,
    rollback:'Restore the verified pre-backfill snapshot; replay post-cutover writes before reopening. Legacy IDs/payloads are not rewritten.'};
  return {manifest,tables,records,report,context,batchId:digest(manifestDigest+sourceDigest)};
}
