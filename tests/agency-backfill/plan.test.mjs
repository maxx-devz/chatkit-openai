import test from 'node:test';
import assert from 'node:assert/strict';
import { validateManifest, classifyLegacyRow, relationPolicy, canonical, recordRef } from '../../scripts/agency-backfill-plan.mjs';
import { filterLegacyAocMemberships, legacyPublicationPredicate } from '../../lib/legacy-agency-compat.js';

const manifest={version:1,clientIds:['11'],agencyAdminUserIds:['21'],operatorUserId:'21',companyGuidance:[],approvalReference:'fictional-review',legacyAppRole:'legacy_fixture'};
const context={clients:new Set(['11','12','13']),owners:new Map([['11','aoc'],['12','harbor']]),aoc:'aoc',admins:new Set(['21']),guidance:new Set([canonical({owner_id:'21',audience:'clients'})])};
const row=(client,extra={})=>({key:{id:'41'},meta:{client_id:client,user_id:'31',...extra},parents_ok:true});
const classify=(name,value)=>classifyLegacyRow({name,policy:relationPolicy(name)},value,context);
test('manifest requires explicit cohort, active-operator review input and safe roles',()=>{
  assert.equal(validateManifest(manifest),manifest);
  for(const changes of [{clientIds:[]},{clientIds:['11','11']},{clientIds:['9223372036854775808']},{operatorUserId:'22'},{legacyAppRole:'role;--'},{companyGuidance:[{owner_id:'21',audience:'admin'}]}]) assert.throws(()=>validateManifest({...manifest,...changes}));
});
test('existing agency ownership is retained and absence is quarantined',()=>{
  assert.equal(classify('portal_client_library',row('11')).agency,'aoc');
  assert.equal(classify('portal_client_library',row('12')).agency,'harbor');
  assert.equal(classify('portal_client_library',row('13')).reason,'unapproved_client');
  assert.equal(classify('portal_client_library',row('99')).reason,'orphan_client');
  assert.equal(classify('portal_client_library',{...row('11'),parents_ok:false}).reason,'orphan_reference');
  assert.equal(classify('portal_unreviewed',row('11')).reason,'unreviewed_relation');
});
test('NULL ownership, private credentials and archived billing never grant common visibility',()=>{
  assert.equal(classify('portal_ai_cost_events',row(null)).scope,'quarantined');
  assert.equal(classify('portal_ai_credentials',row(null)).scope,'platform_private');
  assert.equal(classify('portal_ai_credit_pricing',row(null)).scope,'platform_private');
  assert.equal(classify('portal_chatkit_threads',row('11',{user_id:null})).scope,'quarantined');
});
test('company guidance is AOC agency-only and unapproved publishers stay held',()=>{
  const shared={key:{owner_id:'21',audience:'clients'},meta:{owner_id:'21',audience:'clients'},parents_ok:true};
  assert.deepEqual(classify('portal_source_publications',shared),{scope:'agency',agency:'aoc',client:null,reason:'approved_aoc_guidance'});
  assert.equal(classify('portal_source_publications',row('11',{owner_id:'22'})).scope,'quarantined');
  assert.equal(classify('portal_source_publications',row('12',{owner_id:'21'})).scope,'quarantined');
  assert.equal(classify('portal_source_publications',row(null,{audience:'admin'})).scope,'platform_private');
});
test('reports use stable opaque record references',()=>{
  const ref=recordRef('portal_users',{id:'1234567890'});
  assert.match(ref,/^portal_users:[a-f0-9]{20}$/);assert.ok(!ref.includes('1234567890'));
  assert.equal(ref,recordRef('portal_users',{id:'1234567890'}));
});
test('unmigrated compatibility preserves existing rows and query shape',async()=>{
  const db={query:async()=>({rows:[{installed:false}]})},rows=[{id:'11'},{id:'12'}];
  assert.equal(await filterLegacyAocMemberships(db,rows),rows);assert.equal(await legacyPublicationPredicate(db),'');
});
test('installed compatibility requires an explicit allow result and preserves source selectors',async()=>{
  const db={query:async sql=>({rows:sql.includes('pg_catalog')?[{installed:true}]:[{id:'11'}]})};
  assert.deepEqual(await filterLegacyAocMemberships(db,[{id:'11'},{id:'12'}]),[{id:'11'}]);
  assert.match(await legacyPublicationPredicate(db),/legacy_publication_allowed.*\$2::bigint,\$3::bigint/);
  const inactive={query:async sql=>({rows:sql.includes('pg_catalog')?[{installed:true}]:[]})};
  assert.deepEqual(await filterLegacyAocMemberships(inactive,[{id:'11'}]),[]);
});
