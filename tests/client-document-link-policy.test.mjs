import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateAssignment} from '../lib/client-document-assignment-policy.js';
const publication=()=>({action:'publish',clientId:'12',id:crypto.randomUUID(),revision:'3',operation:crypto.randomUUID(),reason:'Approved client-facing file',stage:4,category:'report',confirmed:true});
test('link publication requires explicit approval, saved identity/revision and scoped client',()=>{
 assert.equal(validateAssignment(publication()).action,'publish');
 for(const patch of [{confirmed:false},{confirmed:'true'},{revision:'0'},{clientId:'0'},{id:undefined},{category:'private'},{stage:null},{stage:8},{reason:''},{ownerId:'1'},{url:'https://evil.test'},{published:true}])assert.throws(()=>validateAssignment({...publication(),...patch}));
});
test('saving cannot mass-assign publication metadata and unpublishing is revision bound',()=>{
 const save={action:'save',clientId:'12',operation:crypto.randomUUID(),reason:'Save draft',title:'Approved file',url:'https://docs.google.com/document/d/abcdefghij12345/edit',stage:null};
 for(const change of [{confirmed:true},{category:'report'},{status:'published_link'},{published:true}])assert.throws(()=>validateAssignment({...save,...change}));
 const revoke={action:'revoke',clientId:'12',id:crypto.randomUUID(),revision:'4',operation:crypto.randomUUID(),reason:'Withdraw link'};
 assert.equal(validateAssignment(revoke).action,'revoke');assert.throws(()=>validateAssignment({...revoke,revision:undefined}));assert.throws(()=>validateAssignment({...revoke,confirmed:true}));
});

test('the simple editor accepts title and description without workflow metadata',()=>{
 const save={action:'save',clientId:'12',operation:crypto.randomUUID(),reason:'Added document link',title:'Website audit report',description:'Findings and next steps.\nFor your website team.',url:'https://docs.google.com/document/d/abcdefghij12345/edit'};
 const value=validateAssignment(save);assert.equal(value.description,save.description);assert.equal(Object.hasOwn(value,'stage'),false);
 const publish=publication();delete publish.stage;delete publish.category;assert.equal(validateAssignment(publish).category,'other');assert.equal(validateAssignment(publish).stage,null);
 for(const description of ['<script>alert(1)</script>','bad\u0000value','x'.repeat(1001),123,null])assert.throws(()=>validateAssignment({...save,description}));
 assert.equal(validateAssignment({...save,description:'  Short description  '}).description,'Short description');
});


test('one-step save and share is an explicit confirmed action; ordinary saving stays private',()=>{
 const body={action:'save_publish',clientId:'12',operation:crypto.randomUUID(),reason:'Shared approved client document',title:'Reviewed report',url:'https://docs.google.com/document/d/abcdefghij12345/edit',confirmed:true};
 assert.equal(validateAssignment(body).action,'save_publish');assert.throws(()=>validateAssignment({...body,confirmed:false}));
 assert.throws(()=>validateAssignment({...body,url:'https://drive.google.com/drive/folders/abcdefghij12345'}));
 assert.throws(()=>validateAssignment({...body,ownerId:'9'}));
});
