import { readFile, writeFile, access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import pg from 'pg';
import { approvedDatabaseTarget, safeDatabaseCode } from './agency-platform-config.mjs';
import { planBackfill, digest, quoteIdentifier, canonical } from './agency-backfill-plan.mjs';

const version='002_legacy_adoption';
async function installOverlay(db,plan) {
  const sql=await readFile(new URL('../database/agency-platform/'+version+'.sql',import.meta.url),'utf8');
  const checksum=digest(sql);
  const existing=(await db.query('SELECT checksum FROM agency_platform.schema_migrations WHERE version=$1',[version])).rows[0];
  if(existing && existing.checksum!==checksum) throw Error('Applied backfill schema checksum differs; review without rewriting history.');
  // The dedicated trusted owner needs SELECT/TRIGGER only for this explicitly
  // inventoried non-Internal legacy surface. No runtime backing-table grants.
  for(const table of plan.tables) await db.query(`GRANT SELECT,TRIGGER ON public.${quoteIdentifier(table.name)} TO aoc_agency_owner`);
  await db.query('SET LOCAL ROLE aoc_agency_owner');
  if(!existing) {
    await db.query(sql);
    await db.query('INSERT INTO agency_platform.schema_migrations(version,checksum) VALUES($1,$2)',[version,checksum]);
  }
}

export async function backfillLegacy(db,manifest,{apply=false}={}) {
  await db.query(apply?'BEGIN ISOLATION LEVEL READ COMMITTED':'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await db.query("SET LOCAL timezone='UTC'");
    await db.query("SET LOCAL lock_timeout='3s'");
    await db.query("SET LOCAL statement_timeout='60s'");
    if(apply) {
      await db.query('SELECT pg_advisory_xact_lock(734901,4)');
      const {rows:names}=await db.query(`SELECT tablename FROM pg_tables WHERE schemaname='public'
        AND tablename LIKE 'portal\\_%' ESCAPE '\\' AND tablename NOT LIKE 'portal\\_internal\\_%' ESCAPE '\\' ORDER BY tablename`);
      // READ COMMITTED: the source snapshot is taken AFTER these writer-blocking
      // locks are acquired. A pre-lock repeatable-read snapshot could miss writes.
      await db.query('LOCK TABLE '+names.map(n=>'public.'+quoteIdentifier(n.tablename)).join(',')+' IN SHARE MODE');
      await db.query('LOCK TABLE agency_platform.agencies,agency_platform.memberships,agency_platform.client_ownership,agency_platform.client_access IN SHARE ROW EXCLUSIVE MODE');
    }
    const plan=await planBackfill(db,manifest);
    const {rows:[mode]}=await db.query("SELECT current_setting('transaction_read_only') AS read_only");
    const report={...plan.report,mode:apply?'apply':'dry-run',transactionReadOnly:mode.read_only==='on',applied:false};
    if(!apply || plan.report.conflicts.length) {
      await db.query('ROLLBACK');
      return report;
    }
    await installOverlay(db,plan);
    await db.query(`GRANT USAGE ON SCHEMA agency_platform TO ${quoteIdentifier(manifest.legacyAppRole)}`);
    await db.query(`GRANT EXECUTE ON FUNCTION agency_platform.legacy_aoc_clients(bigint[]),
      agency_platform.legacy_aoc_client(bigint),agency_platform.legacy_publication_allowed(bigint,text,bigint,bigint)
      TO ${quoteIdentifier(manifest.legacyAppRole)}`);
    let aoc=(await db.query("SELECT id::text FROM agency_platform.agencies WHERE slug='aoc'")).rows[0]?.id;
    if(!aoc) aoc=(await db.query("INSERT INTO agency_platform.agencies(slug,display_name) VALUES('aoc','AOC') RETURNING id::text")).rows[0].id;
    await db.query(`INSERT INTO agency_platform.backfill_state(id,aoc_agency_id,active) VALUES(1,$1,false)
      ON CONFLICT(id) DO NOTHING`,[aoc]);
    for(const client of manifest.clientIds) await db.query(`INSERT INTO agency_platform.client_ownership(client_id,agency_id)
      VALUES($1,$2) ON CONFLICT(client_id) DO NOTHING`,[client,aoc]);
    for(const user of manifest.agencyAdminUserIds) await db.query(`INSERT INTO agency_platform.memberships(agency_id,user_id,role)
      VALUES($1,$2,'agency_admin') ON CONFLICT(agency_id,user_id) DO NOTHING`,[aoc,user]);
    const legacyMemberships=plan.tables.find(t=>t.name==='portal_memberships').rows.filter(r=>manifest.clientIds.includes(r.meta.client_id));
    for(const user of new Set(legacyMemberships.map(r=>r.meta.user_id))) {
      const active=legacyMemberships.some(r=>r.meta.user_id===user && r.meta.is_active!=='false');
      await db.query(`INSERT INTO agency_platform.memberships(agency_id,user_id,role,is_active)
        VALUES($1,$2,'client_user',$3) ON CONFLICT(agency_id,user_id) DO NOTHING`,[aoc,user,active]);
    }
    for(const row of legacyMemberships) await db.query(`INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level,is_active)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(agency_id,client_id,user_id) DO NOTHING`,[aoc,row.meta.client_id,row.meta.user_id,
      row.meta.role==='client_viewer'?'read':row.meta.role==='client_admin'?'manage':'contribute',row.meta.is_active!=='false']);
    await db.query(`INSERT INTO agency_platform.backfill_batches(id,manifest_digest,source_digest,operator_user_id,approval_reference)
      VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING`,[plan.batchId,plan.report.manifestDigest,plan.report.sourceDigest,manifest.operatorUserId,manifest.approvalReference]);
    for(const table of plan.tables) {
      await db.query(`INSERT INTO agency_platform.legacy_catalog(relation_name,key_columns,resource_kind,data_access,client_bound)
        VALUES($1,$2,$3,$4,$5) ON CONFLICT(relation_name) DO NOTHING`,[table.name,table.keys,table.policy.kind,table.policy.access,table.policy.clientBound]);
    }
    for(const key of manifest.companyGuidance) await db.query(`INSERT INTO agency_platform.source_approvals(relation_name,record_key,agency_id,approval_reference)
      VALUES('portal_source_publications',$1,$2,$3) ON CONFLICT(relation_name,record_key) DO NOTHING`,[key,aoc,manifest.approvalReference]);
    let changed=0;
    for(const row of plan.records) {
      const agency=row.agency==='@aoc'?aoc:row.agency;
      const previous=(await db.query('SELECT * FROM agency_platform.legacy_ownership WHERE relation_name=$1 AND record_key=$2',[row.relation,row.key])).rows[0];
      if(previous && previous.scope_kind!=='quarantined' && (previous.scope_kind!==row.scope || String(previous.agency_id||'')!==String(agency||'') || String(previous.client_id||'')!==String(row.client||''))) {
        throw Error('An existing owned record has conflicting lineage; review a new manifest instead of reassigning it.');
      }
      const result=await db.query(`INSERT INTO agency_platform.legacy_ownership
        (relation_name,record_key,scope_kind,agency_id,client_id,row_owner_id,reason,fingerprint,batch_id)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(relation_name,record_key) DO UPDATE SET
          scope_kind=EXCLUDED.scope_kind,agency_id=EXCLUDED.agency_id,client_id=EXCLUDED.client_id,
          row_owner_id=EXCLUDED.row_owner_id,reason=EXCLUDED.reason,fingerprint=EXCLUDED.fingerprint,batch_id=EXCLUDED.batch_id
        WHERE ROW(legacy_ownership.scope_kind,legacy_ownership.agency_id,legacy_ownership.client_id,legacy_ownership.row_owner_id,legacy_ownership.reason,legacy_ownership.fingerprint)
          IS DISTINCT FROM ROW(EXCLUDED.scope_kind,EXCLUDED.agency_id,EXCLUDED.client_id,EXCLUDED.row_owner_id,EXCLUDED.reason,EXCLUDED.fingerprint)`,
      [row.relation,row.key,row.scope,agency,row.client,row.meta.user_id,row.reason,row.fingerprint,plan.batchId]);
      changed+=result.rowCount;
    }
    // Install/update hooks transactionally. No new trigger is visible before
    // the complete validated backfill commits with the compatibility marker.
    for(const table of plan.tables.filter(t=>t.policy.clientBound || t.name==='portal_source_publications')) {
      const {rows:[present]}=await db.query(`SELECT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid=$1::regclass AND tgname='aoc_legacy_ownership_write') AS present`,['public.'+table.name]);
      if(!present.present) await db.query(`CREATE TRIGGER aoc_legacy_ownership_write AFTER INSERT OR UPDATE OR DELETE
        ON public.${quoteIdentifier(table.name)} FOR EACH ROW EXECUTE FUNCTION agency_platform.track_legacy_write()`);
    }
    const after=await planBackfill(db,{...manifest,expectedAgencyId:aoc});
    if(after.report.sourceDigest!==plan.report.sourceDigest || after.records.length!==plan.records.length) throw Error('Legacy record reconciliation failed; rolling back the entire adoption.');
    const {rows:[mapped]}=await db.query("SELECT count(*)::int AS n FROM agency_platform.legacy_ownership WHERE reason<>'record_deleted'");
    if(mapped.n!==plan.records.length) throw Error('Ownership count reconciliation failed; review tombstones/new writers before applying.');
    await db.query('UPDATE agency_platform.backfill_state SET active=true WHERE id=1 AND NOT active');
    await db.query('COMMIT');
    return {...report,applied:true,changedOwnershipRows:changed,totalOwnershipRows:mapped.n,legacyRowsPreserved:true};
  } catch(error) {
    await db.query('ROLLBACK').catch(()=>{});
    throw error;
  }
}

function argumentsFor(args) {
  const options={apply:false};
  for(let i=0;i<args.length;i++) {
    if(args[i]==='--apply') options.apply=true;
    else if(args[i]==='--dry-run') options.apply=false;
    else if(['--manifest','--confirm-database','--report'].includes(args[i]) && args[i+1]) options[args[i].slice(2)]=args[++i];
    else throw new TypeError('Use --dry-run or --apply, --manifest, --confirm-database, and optionally --report.');
  }
  if(!options.manifest || !options['confirm-database']) throw new TypeError('A private approved manifest and exact database acknowledgement are required.');
  return options;
}
async function main() {
  const options=argumentsFor(process.argv.slice(2));
  if(options.report) {
    const exists=await access(options.report).then(()=>true,()=>false);
    if(exists) throw Error('Report path already exists; preserve it and choose a new path.');
  }
  const manifest=JSON.parse(await readFile(options.manifest,'utf8'));
  const connectionString=approvedDatabaseTarget(process.env.AGENCY_BACKFILL_DATABASE_URL,options['confirm-database']);
  const db=new pg.Client({connectionString,connectionTimeoutMillis:8000});
  try {
    await db.connect();
    if((await db.query('SELECT current_database() AS name')).rows[0].name!==options['confirm-database']) throw Error('Connected target does not match the acknowledged database.');
    const report=await backfillLegacy(db,manifest,{apply:options.apply});
    if(options.report) await writeFile(options.report,canonical(report)+'\n',{flag:'wx'});
    console.log(JSON.stringify({mode:report.mode,applied:report.applied,legacyRecords:report.totalLegacyRecords,
      quarantined:report.quarantine.length,conflicts:report.conflicts.length,changedOwnershipRows:report.changedOwnershipRows??0}));
    if(options.apply && !report.applied) process.exitCode=2;
  } finally { await db.end().catch(()=>{}); }
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) main().catch(error=>{
  console.error(`AOC legacy backfill stopped (${safeDatabaseCode(error)}). Review the private target/manifest and sanitized report; no credentials are printed.`);
  process.exitCode=1;
});
