import test from "node:test";
import assert from "node:assert/strict";
import {hubstaffSearchScope,searchIndexState,indexTask,indexComment,SEARCH_FRESHNESS_MS} from "../../lib/hubstaff-search-policy.js";
import {createHubstaffSearchReader} from "../../lib/hubstaff.js";

const url = "https://tasks.hubstaff.com/app/organizations/1/projects/7";
const env = {HUBSTAFF_ACCESS_TOKEN:"synthetic-test-only"};
test("Binding isolates tenants, projects and credential rotations", () => {
  const scope = hubstaffSearchScope("1",url,env);
  assert.equal(scope.binding,hubstaffSearchScope("1",url+"/",env).binding);
  assert.notEqual(scope.binding,hubstaffSearchScope("2",url,env).binding);
  assert.notEqual(scope.binding,hubstaffSearchScope("1",url,{HUBSTAFF_ACCESS_TOKEN:"rotated"}).binding);
  for (const invalid of [url+"/tasks/5",url+"?project=8",url.replace("tasks.hubstaff.com","evil.example"),url.replace("https:","http:")]) {
    assert.equal(hubstaffSearchScope("1",invalid,env),null);
  }
});
test("Missing, incomplete, expired and denied indexes never masquerade as complete history", () => {
  const scope = hubstaffSearchScope("1",url,env);
  const row = {binding:scope.binding,mapping_url:url,checked_at:new Date(),task_count:9,comment_count:3,pending_tasks:2};
  assert.equal(searchIndexState(null,scope).available,false);
  assert.equal(searchIndexState(row,scope).phase,"building");
  row.metadata_complete=true;
  assert.equal(searchIndexState(row,scope).phase,"indexing_comments");
  row.pending_tasks=0;
  assert.equal(searchIndexState(row,scope).phase,"ready");
  assert.equal(searchIndexState({...row,failure_code:"access_denied"},scope).available,false);
  assert.equal(searchIndexState(row,scope,Date.now()+SEARCH_FRESHNESS_MS+100).available,false);
  assert.equal(searchIndexState(row,hubstaffSearchScope("2",url,env)).taskCount,0);
});
test("Only verified task/list/comment ownership and redacted content enter the index", () => {
  const columns = new Map([["9",{name:"Doing"}]]);
  const members = {"10":"Synthetic Person"};
  const task = indexTask({id:5,list_id:9,subject:"SEO fixes",description:"Password: PlainPass123!\nSEO approved",assignee_ids:[10,11],done:true},columns,members);
  assert.equal(task.people_complete,false);
  assert.deepEqual(task.assignee_names,["Synthetic Person"]);
  assert.doesNotMatch(task.description,/PlainPass/);
  assert.match(task.description,/SEO approved/);
  assert.throws(() => indexTask({id:5,list_id:8},columns,members),/unverified/);
  assert.throws(() => indexComment({id:1,task_id:6},5,members),/unverified/);
  assert.equal(indexComment({id:1,task_id:5,user_id:10,content:"Approved"},5,members).author_name,"Synthetic Person");
});
test("Background reader verifies ownership before comments and rejects broken pagination", async t => {
  const oldFetch = globalThis.fetch;
  const oldPat = process.env.HUBSTAFF_PAT_REFRESH_TOKEN;
  const oldAccess = process.env.HUBSTAFF_ACCESS_TOKEN;
  process.env.HUBSTAFF_PAT_REFRESH_TOKEN="";process.env.HUBSTAFF_ACCESS_TOKEN="synthetic";
  t.after(() => {
    globalThis.fetch=oldFetch;
    if (oldPat === undefined) delete process.env.HUBSTAFF_PAT_REFRESH_TOKEN; else process.env.HUBSTAFF_PAT_REFRESH_TOKEN=oldPat;
    if (oldAccess === undefined) delete process.env.HUBSTAFF_ACCESS_TOKEN; else process.env.HUBSTAFF_ACCESS_TOKEN=oldAccess;
  });
  const paths=[];
  let foreign=false;
  let invalid=false;
  globalThis.fetch=async value => {
    const path=new URL(value).pathname;paths.push(path);
    return Response.json(path.endsWith("/projects/7") ? {project:{id:7,organization_id:1}}
      : path.endsWith("/lists") ? {lists:[{id:9,project_id:7,name:"Doing"}]}
      : path.endsWith("/members") ? {members:[{id:10,name:"Synthetic Person"}]}
      : path.endsWith("/tasks/5") ? {task:{id:5,list_id:foreign?8:9}}
      : path.endsWith("/comments") ? {comments:[],pagination:{next_page_start_id:0}}
      : {tasks:[{id:5,list_id:9}],pagination:{next_page_start_id:invalid?123:null}});
  };
  const reader=await createHubstaffSearchReader(url);
  const metadata=await reader.metadata();
  assert.equal(metadata.members["10"],"Synthetic Person");
  assert.equal((await reader.comments(5,null,metadata.columns)).next,null);
  foreign=true;paths.length=0;
  await assert.rejects(reader.comments(5,null,metadata.columns),/outside_project/);
  assert.deepEqual(paths,["/api/v1/tasks/5"]);
  invalid=true;
  await assert.rejects(reader.tasks(123),/invalid_index_page/);
});
