import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const source = (await readFile(new URL("../lib/make-webhook.js",import.meta.url),"utf8"))
  .replace('import "server-only";','');
const {sendMakeConnectionTest} = await import("data:text/javascript;base64,"+Buffer.from(source).toString("base64"));

test("Make connection test accepts only its approved HTTPS destination and fixed payload",async()=>{
  for(const webhookUrl of ["http://hook.make.com/x","https://example.com/x","https://hook.make.com:8443/x",
    "https://user:pass@hook.make.com/x","https://hook.make.com/x#secret"]) {
    await assert.rejects(sendMakeConnectionTest({webhookUrl,fetchImpl:()=>assert.fail("No network for a rejected destination")}));
  }
  const requests=[];
  const webhookUrl="https://hook.make.com/synthetic-private-destination";
  const fetchImpl=async(url,options)=>{
    requests.push(JSON.parse(options.body));
    assert.equal(options.redirect,"error");
    return Response.json({success:true,event:"portal.connection_test",message:"Confirmed "+webhookUrl});
  };
  const first=await sendMakeConnectionTest({webhookUrl,fetchImpl});
  const second=await sendMakeConnectionTest({webhookUrl,fetchImpl});
  assert.notEqual(first.requestId,second.requestId);
  assert.deepEqual(Object.keys(requests[0]).sort(),["environment","event","initiatedBy","requestId","sentAt","source","version"]);
  assert.equal(requests[0].event,"portal.connection_test");
  assert.ok(!first.message.includes(webhookUrl));
});
