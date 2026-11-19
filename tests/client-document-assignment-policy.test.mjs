import {test} from "node:test";
import assert from "node:assert/strict";
import {parseDriveReference,validateAssignment} from "../lib/client-document-assignment-policy.js";
const body=()=>({action:"save",clientId:"12",title:"Approved audit",url:"https://drive.google.com/file/d/abcdefghij123456/view?resourcekey=private#ignored",stage:4,reason:"Prepare delivery",operation:crypto.randomUUID()});
test("Drive references normalize supported direct links without credentials or query keys",()=>{
 assert.deepEqual(parseDriveReference(body().url),{driveId:"abcdefghij123456",kind:"document",url:"https://drive.google.com/file/d/abcdefghij123456/view"});
 assert.equal(parseDriveReference("https://drive.google.com/drive/u/0/folders/abcdefghij123456").kind,"folder");
 for(const type of ["document","spreadsheets","presentation"])assert.equal(parseDriveReference(`https://docs.google.com/${type}/d/abcdefghij123456/edit`).kind,"document");
});
test("Untrusted hosts, executable URLs and malformed Drive paths are rejected",()=>{
 for(const url of ["http://drive.google.com/file/d/abcdefghij123456/view","https://drive.google.com.evil.test/file/d/abcdefghij123456/view","https://someone:password@drive.google.com/drive/folders/abcdefghij123456","javascript:alert(1)","https://drive.google.com/drive/my-drive","https://docs.google.com/document/d/short/edit","https://drive.google.com:8443/drive/folders/abcdefghij123456"])assert.throws(()=>parseDriveReference(url));
});
test("Assignments validate explicit client/stage and reject privilege or publication mass assignment",()=>{
 assert.equal(validateAssignment(body()).stage,4);assert.equal(validateAssignment({...body(),stage:null}).stage,null);
 for(const change of [{clientId:"0"},{clientId:12},{stage:"4"},{stage:8},{title:"<script>"},{ownerId:"1"},{published:true},{status:"approved"},{action:"delete"}])assert.throws(()=>validateAssignment({...body(),...change}));
});
test("Edit and removal requests require a saved id, current revision, operation and reason",()=>{
 const id=crypto.randomUUID();assert.equal(validateAssignment({...body(),id,revision:"1"}).id,id);
 assert.throws(()=>validateAssignment({...body(),id,revision:"0"}));assert.throws(()=>validateAssignment({...body(),operation:"not-an-id"}));
 assert.throws(()=>validateAssignment({action:"archive",clientId:"12",operation:crypto.randomUUID(),reason:""}));
 assert.equal(validateAssignment({action:"archive",clientId:"12",id,revision:"2",operation:crypto.randomUUID(),reason:"Wrong reference"}).action,"archive");
});
