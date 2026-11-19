import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {randomUUID} from "node:crypto";
import {DriveSourceError} from "../../lib/drive-source-policy.js";
import {inWorkspaceCache} from "../../lib/workspace-cache.js";
import {streamWithWorkflow} from "../../lib/chatkit-workflow.js";

test("Client Work chat uses a usable index; an unavailable object does not suppress fallback; General gets no index",async t=>{
  const previous=process.env.BETTER_AUTH_URL;
  process.env.BETTER_AUTH_URL="https://portal.test";
  t.after(()=>{if(previous===undefined) delete process.env.BETTER_AUTH_URL;else process.env.BETTER_AUTH_URL=previous;});
  for(const scenario of ["indexed","unavailable","general","unmapped","unmapped_general","sources_unavailable","sources_unavailable_nonstream","sources_revision"]) {
    let indexed=0,live=0,sent;
    const mocks={
      ASSISTANT_INSTRUCTIONS:"Synthetic rules",DriveSourceError,streamWithWorkflow,inWorkspaceCache,
      assertTrustedOrigin(){},
      getPortalAiContext:async()=>({clientId:"1",userId:"10",aiEnabled:true,hubstaffProjectUrl:scenario.startsWith("unmapped")?null:"https://assigned.test"}),
      chatKitThreadId:()=>null,chatKitInputText:()=>"What needs approval?",
      isReplyRequest:()=>true,readJsonRequest:r=>r.json(),
      loadPreparedSourceContext:async()=>{
        if(scenario.startsWith("sources_"))
          throw new DriveSourceError(scenario==="sources_revision"?"source_revision_changed":"prepared_sources_unavailable",
            "PRIVATE SOURCE DETAILS AND CREDENTIAL DIAGNOSTICS",503);
        return {instructions:"",references:scenario==="unmapped"?[{text:"A16_APPROVED_BUSINESS_GUIDANCE",usage:"company_guidance",excerpt:"Authorized synthetic knowledge"}]:[]};
      },
      hubstaffContextQuery:()=>"approval",hubstaffMetricsRequested:()=>false,
      hubstaffActivityAnalyticsRequested:()=>false,hubstaffCredentialAuditRequested:()=>false,
      hubstaffTaskReferences:()=>[],
      indexedHubstaffSnapshot:async(id,url,options)=>{
        indexed++;assert.equal(id,"1");assert.equal(url,"https://assigned.test");
        assert.equal(options.verifyAccess,true);
        return {binding:scenario==="indexed"?"a".repeat(64):"",snapshot:{available:scenario==="indexed",index:{available:scenario==="indexed"}}};
      },
      loadHubstaffAssistantSnapshot:async()=>{live++;return {available:true};},
      appendPreparedInstructions:a=>a,chatKitBackendUrl:()=>"https://mock.invalid/chatkit",
      signChatKitRequest:()=>({}),withDebuggerTrace:(_r,run)=>run(),debuggerSpan:(_name,run)=>run(),
      fetch:async(_url,options)=>{sent=JSON.parse(options.body);return Response.json({mock:true});},
    };
    const key=randomUUID();globalThis[key]=mocks;
    let route;
    try {
      const source=await readFile(new URL("../../app/api/chatkit/route.js",import.meta.url),"utf8");
      const code=`const {${Object.keys(mocks).join(",")}}=globalThis[${JSON.stringify(key)}];\n`
        +source.replace(/^import[\s\S]*?from [^;]+;\r?\n/gm,"");
      route=await import("data:text/javascript;base64,"+Buffer.from(code).toString("base64"));
    } finally {delete globalThis[key];}
    const response=await route.POST(new Request("https://portal.test/api/chatkit",{
      method:"POST",headers:{"x-aoc-client":"1","x-aoc-chat-mode":["general","unmapped_general"].includes(scenario)?"general":"work",
        ...(scenario.startsWith("sources_") && scenario!=="sources_unavailable_nonstream"?{"x-aoc-workflow":"1"}:{})},
      body:JSON.stringify({type:"threads.create"}),
    }));
    if(scenario.startsWith("sources_")) {
      assert.equal(response.status,scenario==="sources_unavailable_nonstream"?503:200);
      const wire=await response.text();
      assert.match(wire,/company guidance/);
      assert.match(wire,scenario==="sources_revision"?/changed while loading/:/administrator/);
      assert.doesNotMatch(wire,/PRIVATE SOURCE|CREDENTIAL|connection was interrupted/);
      assert.equal(indexed,0);assert.equal(live,0);assert.equal(sent,undefined);
      continue;
    }
    assert.equal(response.status,200,scenario);
    assert.equal(indexed,["general","unmapped","unmapped_general"].includes(scenario)?0:1,scenario);
    assert.equal(live,scenario==="unavailable"?1:0,scenario);
    assert.equal(Boolean(sent.hubstaff_index_binding),scenario==="indexed",scenario);
    if(["general","unmapped_general"].includes(scenario)) assert.equal(sent.hubstaff,null);
    if(scenario==="unmapped"){assert.equal(sent.hubstaff.available,false);assert.equal(sent.hubstaff.reason,"no_project_mapping");assert.match(JSON.stringify(sent.source_references),/A16_APPROVED_BUSINESS_GUIDANCE/);assert.equal(live,0);assert.equal(indexed,0);}
  }
});
