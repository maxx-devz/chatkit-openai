import {test} from "node:test";
import assert from "node:assert/strict";
import {CLIENT_JOURNEY_STEPS,clientStepForStage,internalStagesForClientStep,clientJourneyProgress} from "../lib/client-journey.js";
import {clientDocumentFilters,documentSearchPattern} from "../lib/client-document-filters.js";

test("the seven internal stages map to the reviewed five client steps",()=>{
 assert.deepEqual([1,2,3,4,5,6,7].map(clientStepForStage),[1,1,2,3,4,4,5]);
 assert.deepEqual(internalStagesForClientStep(1),[1,2]);assert.deepEqual(internalStagesForClientStep(4),[5,6]);
 assert.equal(CLIENT_JOURNEY_STEPS[2],"Review Your Plan");
 for(const value of [0,8,null,"4",1.5,NaN])assert.equal(clientStepForStage(value),null);
});
test("a grouped step stays current until all of its internal stages are passed",()=>{
 for(const stage of [1,2]){const p=clientJourneyProgress({currentStage:stage,completed:false});assert.equal(p.currentStep,1);assert.equal(p.steps[0].status,"Current");}
 for(const stage of [5,6]){const p=clientJourneyProgress({currentStage:stage,completed:false});assert.equal(p.currentStep,4);assert.equal(p.steps[3].status,"Current");assert.equal(p.steps[4].status,"Upcoming");}
 const p=clientJourneyProgress({currentStage:7,completed:false});assert.equal(p.steps[4].status,"Current");
 assert.ok(clientJourneyProgress({currentStage:7,completed:true}).steps.every(s=>s.status==="Completed"));
});
test("unknown progress and malformed completion never fabricate completion",()=>{
 for(const v of [null,{}, {currentStage:99,completed:true}])assert.ok(clientJourneyProgress(v).steps.every(s=>s.status==="Unconfirmed"));
 assert.equal(clientJourneyProgress({currentStage:5,completed:true}).completed,false);
});
test("document filters validate categories and client steps and preserve literal search terms",()=>{
 assert.deepEqual(clientDocumentFilters({search:"  audit  ",category:"report",step:"3"}),{search:"audit",category:"report",step:"3"});
 assert.equal(documentSearchPattern("100%_approved\\copy"),"%100\\%\\_approved\\\\copy%");
 for(const bad of [{search:"x".repeat(181)},{search:"<script>"},{search:"bad\nvalue"},{category:"payroll"},{category:"toString"},{step:"7"},{step:"1 OR true"},{step:3}])assert.throws(()=>clientDocumentFilters(bad));
});
