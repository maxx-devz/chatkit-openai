import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID,timingSafeEqual} from "node:crypto";
import {hubstaffSearchScope,indexTask,indexComment} from "../../lib/hubstaff-search-policy.js";

const url="https://tasks.hubstaff.com/app/organizations/1/projects/7";
async function moduleWithMocks(file,mocks) {
  const key=randomUUID();
  const source=await readFile(new URL(file,import.meta.url),"utf8");
  globalThis[key]=mocks;
  try {
    const code=`const {${Object.keys(mocks).join(",")}}=globalThis[${JSON.stringify(key)}];\n`
      +source.replace(/^import .*;\r?\n/gm,"");
    return await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
  } finally {delete globalThis[key];}
}

test("Scheduler rejects missing/weak/query secrets and accepts either server secret without admin login",async t=>{
  const old={HUBSTAFF_INDEX_SYNC_SECRET:process.env.HUBSTAFF_INDEX_SYNC_SECRET,CRON_SECRET:process.env.CRON_SECRET};
  t.after(()=>{for(const [k,v] of Object.entries(old)) if(v===undefined) delete process.env[k];else process.env[k]=v;});
  process.env.HUBSTAFF_INDEX_SYNC_SECRET="a".repeat(40);
  process.env.CRON_SECRET="b".repeat(40);
  const calls=[];
  const route=await moduleWithMocks("../../app/api/cron/hubstaff-index/route.js",{
    timingSafeEqual,synchronizeAllHubstaffSearch:async options=>{calls.push(options);return {results:[],processedClients:0};},
  });
  for(const header of ["","Bearer wrong"]) {
    const response=await route.GET(new Request("https://portal.test/api/cron/hubstaff-index?secret="+"a".repeat(40),
      {headers:{Authorization:header}}));
    assert.equal(response.status,401);
  }
  assert.equal(calls.length,0);
  for(const secret of ["a","b"]) {
    const response=await route.GET(new Request("https://portal.test/api/cron/hubstaff-index",
      {headers:{Authorization:"Bearer "+secret.repeat(40)}}));
    assert.equal(response.status,200);
    assert.equal(response.headers.get("cache-control"),"no-store");
    assert.equal((await response.json()).retryAfterSeconds,60);
  }
  assert.equal(calls.length,2);
  assert.equal(calls[0].maxClients,3);
  assert.ok(calls[0].signal instanceof AbortSignal);
  process.env.HUBSTAFF_INDEX_SYNC_SECRET="short";delete process.env.CRON_SECRET;
  assert.equal((await route.GET(new Request("https://portal.test/api/cron/hubstaff-index",
    {headers:{Authorization:"Bearer short"}}))).status,401);
});

test("Scheduler reports safe failure codes instead of exposing provider details",async()=>{
  const previous=process.env.HUBSTAFF_INDEX_SYNC_SECRET;
  process.env.HUBSTAFF_INDEX_SYNC_SECRET="a".repeat(40);
  try {
    const route=await moduleWithMocks("../../app/api/cron/hubstaff-index/route.js",{
      timingSafeEqual,synchronizeAllHubstaffSearch:async()=>({results:[{clientId:"1",code:"access_denied"}]}),
    });
    const response=await route.GET(new Request("https://portal.test/api/cron/hubstaff-index",
      {headers:{Authorization:"Bearer "+"a".repeat(40)}}));
    assert.equal(response.status,503);assert.equal(response.headers.get("retry-after"),"60");
    assert.equal((await response.json()).results[0].code,"access_denied");
  } finally {if(previous===undefined) delete process.env.HUBSTAFF_INDEX_SYNC_SECRET;else process.env.HUBSTAFF_INDEX_SYNC_SECRET=previous;}
});

async function syncFixture({cancel=false,status,failMetadata=false,abortOnFailure=false,rows=[{id:"1"},{id:"2"}]}={}) {
  const controller=new AbortController(),queries=[],seen=[],commits=[];
  const states=new Map();
  const state=id=>{
    if(!states.has(id)) states.set(id,{binding:hubstaffSearchScope(id,url).binding,mapping_url:url,
      metadata_complete:true,next_scan_at:new Date(Date.now()+60000),scan_active:false,task_cursor:null});
    return states.get(id);
  };
  const query=async(sql,values=[])=>{
    queries.push({sql,values});
    if(sql.includes("SELECT p.id FROM")) return {rows};
    if(sql.includes("SELECT id,hubstaff_project_url")) return {rows:[{id:values[0],hubstaff_project_url:url}]};
    if(sql.includes("RETURNING client_id")) {seen.push(values[0]);return {rows:[{client_id:values[0]}]};}
    if(sql.includes("SELECT * FROM portal_hubstaff_search_indexes")) return {rows:[state(values[0])]};
    if(sql.includes("SET members")) return {rows:[state(values[0])]};
    if(sql.includes("SELECT task_id,comments_cursor")) return {rows:[]};
    if(sql==="COMMIT") commits.push(true);
    if(cancel && sql.includes("comments_generation=comments_generation+1")) controller.abort();
    return {rows:[]};
  };
  const pool={query,connect:async()=>({query,release(){}})};
  const module=await moduleWithMocks("../../lib/hubstaff-search-sync.js",{
    randomUUID,databasePool:pool,hubstaffSearchScope,indexTask,indexComment,
    createHubstaffSearchReader:async()=>({metadata:async()=>{
      if(failMetadata) {if(abortOnFailure) controller.abort();throw {publicDetails:{httpStatus:status}};}
      return {members:{},columns:new Map()};
    }}),
  });
  return {module,controller,queries,seen,commits};
}

test("Closing the page preserves verified access and committed pages, releases its own lease",async()=>{
  const f=await syncFixture({cancel:true});
  await assert.rejects(f.module.synchronizeHubstaffSearch("1",{signal:f.controller.signal}));
  const cleanup=f.queries.find(q=>q.sql.includes("failure_code=CASE"));
  assert.equal(cleanup.values[2],true);
  assert.ok(f.commits.length>=2);
  assert.match(cleanup.sql,/WHERE client_id=\$1 AND lease_token=\$2/);
  assert.match(cleanup.sql,/WHEN \$3 THEN failure_code/);
});

test("Queue requests use the saved mapping, persist without external reads and preserve current cursors",async()=>{
  const queries=[];
  const query=async(sql,values=[])=>{
    queries.push({sql,values});
    if(sql.includes("SELECT id,hubstaff_project_url"))return {rows:[{id:"1",hubstaff_project_url:url}]};
    if(sql.includes("INSERT INTO portal_hubstaff_search_indexes"))return {rows:[{queued_at:new Date()}]};
    return {rows:[]};
  };
  const module=await moduleWithMocks("../../lib/hubstaff-search-sync.js",{
    randomUUID,databasePool:{connect:async()=>({query,release(){}})},hubstaffSearchScope,indexTask,indexComment,
    createHubstaffSearchReader:()=>assert.fail("Queueing must not call Hubstaff"),
  });
  const result=await module.queueHubstaffSearch("1");
  assert.equal(result.queued,true);
  assert.equal(result.clientId,"1");
  const saved=queries.find(q=>q.sql.includes("INSERT"));
  assert.equal(saved.values[2],url);
  assert.match(queries[1].sql,/FOR SHARE/);
  assert.doesNotMatch(saved.sql,/DELETE|task_cursor|comments_cursor|failure_code=/);
  assert.equal(queries.at(-1).sql,"COMMIT");
});

test("An actual access denial still blocks the index even when a request is cancelled",async()=>{
  for(const status of [401,403,429,500]) {
    const f=await syncFixture({status,failMetadata:true});
    await assert.rejects(f.module.synchronizeHubstaffSearch("1",{signal:f.controller.signal}));
    const cleanup=f.queries.find(q=>q.sql.includes("failure_code=CASE"));
    assert.equal(cleanup.values[2],false);
    assert.equal(cleanup.values[3],[401,403].includes(status)?"access_denied":"sync_failed");
    assert.equal(cleanup.values[4],status===429);
  }
  const cancelled=await syncFixture({status:403,failMetadata:true,abortOnFailure:true});
  await assert.rejects(cancelled.module.synchronizeHubstaffSearch("1",{signal:cancelled.controller.signal}));
  const cleanup=cancelled.queries.find(q=>q.sql.includes("failure_code=CASE"));
  assert.equal(cleanup.values[2],false);assert.equal(cleanup.values[3],"access_denied");
});

test("All-client runner rotates by attempt, skips active/backoff leases and continues after a failed client",async()=>{
  const f=await syncFixture({status:403,failMetadata:true});
  const result=await f.module.synchronizeAllHubstaffSearch();
  assert.deepEqual(f.seen,["1","2"]);
  assert.deepEqual(result.results.map(r=>r.code),["access_denied","access_denied"]);
  const selection=f.queries[0];
  assert.match(selection.sql,/ORDER BY \(i.queued_at IS NOT NULL\) DESC,i.last_attempt_at/);
  assert.match(selection.sql,/i.next_attempt_at<=NOW/);
  assert.match(selection.sql,/i.lease_until<NOW/);
  assert.match(selection.sql,/p.portal_enabled=TRUE AND p.ai_enabled=TRUE/);
  assert.deepEqual(selection.values,[3]);
});

test("A rate limit ends the invocation and an aborted job starts no new clients",async()=>{
  const f=await syncFixture({status:429,failMetadata:true});
  const result=await f.module.synchronizeAllHubstaffSearch();
  assert.deepEqual(f.seen,["1"]);assert.equal(result.results[0].code,"rate_limited");
  f.controller.abort();f.seen.length=0;
  await f.module.synchronizeAllHubstaffSearch({signal:f.controller.signal});
  assert.deepEqual(f.seen,[]);
});

test("Fresh SQL index avoids Hubstaff; stale matching index rechecks metadata only; changed mapping remains blocked",async()=>{
  const scope=hubstaffSearchScope("1",url);
  for(const mode of ["fresh","stale","denied","rotated","changed_during_check"]) {
    const row={binding:mode==="rotated"?"changed":scope.binding,mapping_url:url,
      checked_at:mode==="fresh"?new Date():new Date(0),metadata_complete:true,task_count:127};
    let reads=0,updates=0;
    const databasePool={query:async(sql)=>{
      if(sql.startsWith("SELECT")) return {rows:[row]};
      updates++;
      if(sql.includes("SET checked_at")) return {rows:mode==="changed_during_check"?[]:[{...row,checked_at:new Date(),failure_code:null}]};
      return {rows:[]};
    }};
    const {searchIndexState,adminIndexProgress}=await import("../../lib/hubstaff-search-policy.js");
    const store=await moduleWithMocks("../../lib/hubstaff-search-store.js",{
      databasePool,hubstaffSearchScope,searchIndexState,adminIndexProgress,
      createHubstaffSearchReader:async()=>({metadata:async()=>{
        reads++;if(mode==="denied") throw {publicDetails:{httpStatus:403}};return {members:{}};
      },tasks:()=>assert.fail("No history scan on permission recovery")}),
    });
    const snapshot=await store.indexedHubstaffSnapshot("1",url,{verifyAccess:true});
    assert.equal(snapshot.snapshot.available,["fresh","stale"].includes(mode),mode);
    assert.equal(reads,["fresh","rotated"].includes(mode)?0:1,mode);
    assert.equal(Boolean(snapshot.binding),snapshot.snapshot.available);
    if(mode==="fresh") assert.equal(updates,0);
  }
});
