import test from "node:test";
import assert from "node:assert/strict";
import {createClientIndexMonitor,clientIndexComplete} from "../lib/hubstaff-index-monitor.js";

const flush=async()=>{for(let n=0;n<5;n++)await new Promise(resolve=>setImmediate(resolve));};
function fixture(t,{client,post,get,visible=true}={}) {
  let time=Date.now(),id=0;
  const state=client || {id:"1",available:true,eligibleForBatch:true,savedTaskCount:10,savedCommentCount:20,
    savedMetadataComplete:false,savedPendingTasks:10};
  const timers=new Map(),calls=[],events={clients:[],busy:[],running:[],errors:[]};
  const monitor=createClientIndexMonitor({
    clientId:"1",now:()=>time,isVisible:()=>visible,
    schedule:(fn,ms)=>{timers.set(++id,{fn,at:time+ms});return id;},unschedule:key=>timers.delete(key),
    onClient:c=>events.clients.push(c && {...c}),onBusy:b=>events.busy.push(b),
    onRunning:b=>events.running.push(b),onError:e=>events.errors.push(e),
    fetchImpl:async(url,options)=>{
      assert.equal(url,options.method?"/api/admin/hubstaff-index":"/api/admin/hubstaff-index?clientId=1");
      assert.equal(options.credentials,"same-origin");assert.equal(options.cache,"no-store");
      calls.push({url,...options});
      if(!options.method)return get?get():Response.json({clients:[state]});
      const body=JSON.parse(options.body);
      assert.equal(body.clientId,"1");
      if(body.action==="queue") {
        state.queuedAt=new Date(time).toISOString();
        return Response.json({clientId:"1",queued:true},{status:202});
      }
      state.queuedAt=null;
      return post?post(state):Response.json({clientId:"1",syncedTasks:2,syncedComments:8,retryAfterSeconds:12});
    },
  });
  t.after(()=>monitor.stop());
  return {monitor,state,calls,events,timers,
    async start(){monitor.start();await flush();},
    async advance(ms){time+=ms;for(const [key,timer] of [...timers])if(timer.at<=time&&timers.delete(key))await timer.fn();await flush();},
    batches:()=>calls.filter(c=>c.method==="POST"&&!JSON.parse(c.body).action),
    queues:()=>calls.filter(c=>c.method==="POST"&&JSON.parse(c.body).action==="queue"),
  };
}

test("Opening a client loads only its status and never starts an unrequested Hubstaff sync",async t=>{
  const f=fixture(t);await f.start();await f.advance(60000);
  assert.equal(f.calls.filter(c=>c.method==="POST").length,0);
  assert.equal(f.events.clients[0].savedCommentCount,20);
});
test("Start syncing persists one queue request then resumes bounded batches for this client only",async t=>{
  const f=fixture(t);await f.start();
  assert.equal(await f.monitor.queue(),true);assert.equal(await f.monitor.queue(),false);
  assert.equal(f.queues().length,1);
  await f.advance(15000);
  assert.equal(f.batches().length,1);
  await f.advance(5000);assert.equal(f.batches().length,1);
  await f.advance(10000);assert.equal(f.batches().length,2);
});
test("A persisted queue resumes after remount, even if the old inventory was complete",async t=>{
  const f=fixture(t,{client:{id:"1",available:true,eligibleForBatch:true,queuedAt:new Date().toISOString(),
    savedMetadataComplete:true,savedPendingTasks:0}});
  await f.start();
  assert.equal(f.queues().length,0);assert.equal(f.batches().length,1);
});
test("Actual server completion stops the browser runner and shows persisted counts",async t=>{
  const f=fixture(t,{post:state=>{
    Object.assign(state,{savedMetadataComplete:true,savedPendingTasks:0,lastBatchTasks:2,lastBatchComments:8});
    return Response.json({clientId:"1",syncedTasks:2,syncedComments:8});
  }});
  await f.start();await f.monitor.queue();await f.advance(15000);
  assert.equal(clientIndexComplete(f.state),true);
  assert.equal(f.events.clients.at(-1).lastBatchComments,8);
  await f.advance(60000);assert.equal(f.batches().length,1);
  assert.equal(f.events.running.at(-1),false);
});
test("Status can refresh while one batch runs without overlapping POSTs",async t=>{
  let finish;
  const f=fixture(t,{post:()=>new Promise(resolve=>{finish=resolve;})});
  await f.start();await f.monitor.queue();await f.advance(15000);
  const reads=f.calls.length;
  await f.advance(5000);assert.ok(f.calls.length>reads);assert.equal(f.batches().length,1);
  finish(Response.json({clientId:"1",syncedTasks:0,syncedComments:8}));await flush();
  assert.equal(f.events.busy.at(-1),false);
});
test("Rate limits back off; denied Hubstaff access stops browser batches without deleting stored counts",async t=>{
  for(const status of [429,403]) {
    const f=fixture(t,{post:()=>Response.json({error:"Wait or check access",
      code:status===429?"hubstaff_rate_limited":"hubstaff_access_denied",retryAfterSeconds:60},{status})});
    await f.start();await f.monitor.queue();await f.advance(15000);
    await f.advance(30000);assert.equal(f.batches().length,1);
    await f.advance(30000);assert.equal(f.batches().length,status===429?2:1);
    assert.equal(f.events.clients.at(-1).savedTaskCount,10);
  }
});
test("Losing admin authentication stops requests; hidden tabs do not poll",async t=>{
  const f=fixture(t,{get:()=>Response.json({error:"Sign in again"},{status:401})});
  await f.start();const calls=f.calls.length;await f.advance(60000);
  assert.equal(f.calls.length,calls);assert.equal(await f.monitor.queue(),false);
  const hidden=fixture(t,{visible:false});await hidden.start();await hidden.advance(60000);
  assert.equal(hidden.calls.length,0);
});
test("Switching clients stops this monitor, aborts requests and ignores late responses",async t=>{
  let finish;
  const f=fixture(t,{post:()=>new Promise(resolve=>{finish=resolve;})});
  await f.start();await f.monitor.queue();await f.advance(15000);
  const before=f.events.clients.length;
  f.monitor.stop();
  assert.equal(f.batches()[0].signal.aborted,true);assert.equal(f.timers.size,0);
  finish(Response.json({clientId:"1",syncedTasks:999,syncedComments:999}));await flush();
  assert.equal(f.events.clients.length,before);
});
test("Missing, refreshing or queued inventories cannot be reported complete",()=>{
  const ready={available:true,savedMetadataComplete:true,savedPendingTasks:0};
  assert.equal(clientIndexComplete(ready),true);
  for(const patch of [{available:false},{savedMetadataComplete:false},{savedPendingTasks:1},{refreshing:true},{syncing:true},{queuedAt:new Date()}])
    assert.equal(clientIndexComplete({...ready,...patch}),false);
  assert.equal(clientIndexComplete(null),false);
});
