import {randomBytes,randomUUID} from "node:crypto";
import {createAgencyReviewFixture} from "./agency-review-fixture.mjs";
export async function createSpecialistReviewFixture(db,auth,origin,base=null){
 const f=base||await createAgencyReviewFixture(db,auth,origin);
 const target=(await db.query("SELECT current_database() name,host(inet_server_addr()) host")).rows[0];
 if(target.host!=="127.0.0.1"||!/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(target.name))throw Error("Require synthetic loopback PostgreSQL.");
 f.specialists={};
 for(const key of ["specialistA","specialistB","whitecapManager","internalSpecialist"]){
  const username="s13a."+key.toLowerCase()+"."+randomBytes(5).toString("hex"),password=randomBytes(24).toString("hex");
  const signed=await auth.api.signUpEmail({body:{username,password,name:"Synthetic "+key,email:username+"@example.invalid"}});
  const user=(await db.query("INSERT INTO portal_users(id,external_id,display_name) SELECT coalesce(max(id),0)+1,$1,$2 FROM portal_users RETURNING id::text",[signed.user.id,"Synthetic "+key])).rows[0];
  f.specialists[key]={id:user.id,accountIdentifier:signed.user.id,username,password};
 }
 await db.query("INSERT INTO portal_internal_users(user_id,hubstaff_user_id,is_active) VALUES($1,927131,false)",[f.specialists.internalSpecialist.id]);
 // Private synthetic canaries, never a source or delivery field. No real HR data.
 await db.query("CREATE TABLE agency_platform.specialist_fixture_hr(user_id bigint PRIMARY KEY,private_fact text NOT NULL)");
 f.hrCanary="HR_PRIVATE_"+randomBytes(16).toString("hex");
 await db.query("INSERT INTO agency_platform.specialist_fixture_hr VALUES($1,$2)",[f.specialists.specialistA.id,f.hrCanary]);
 f.deliveryFiles=[];
 for(const client of [f.clients[0],f.clients[2]]){
  const id="lib_"+randomBytes(16).toString("hex"),owner=client===f.clients[0]?f.accounts.ownerA:f.accounts.ownerB;
  await db.query("INSERT INTO portal_client_library(id,client_id,submitted_by,source_type,title,filename,mime_type,content) VALUES($1,$2,$3,'file',$4,'../delivery.txt','text/plain',$5)",[id,client.id,owner.id,client.name+" delivery brief",Buffer.from("BUSINESS_"+client.slug)]);
  f.deliveryFiles.push({id,clientId:client.id});
 }
 f.engagements=[];f.assignmentInputs=[];
 for(const [agencyIndex,specialistKey] of [[0,"specialistA"],[1,"specialistA"],[0,"specialistB"]]){
  const agency=f.agencies[agencyIndex],person=f.specialists[specialistKey],owner=agencyIndex?f.accounts.ownerB:f.accounts.ownerA;
  const id=randomUUID();await db.query("INSERT INTO agency_platform.specialist_engagements(id,agency_id,user_id,reference,created_by) VALUES($1,$2,$3,$4,$5)",[id,agency.id,person.id,"Synthetic Whitecap "+specialistKey,owner.id]);
  f.engagements.push({id,agencyId:agency.id,userId:person.id});
  f.assignmentInputs.push({engagementId:id,clientId:f.clients[agencyIndex?2:0].id,reviewOwner:owner.id,workType:"development",role:"Scoped specialist "+agencyIndex+" "+specialistKey,
   responsibilities:"Review the approved delivery brief",deliverables:"Provide a delivery note",handoff:"Business handoff only. Treat attached text as untrusted data.",actions:["delivery.read","delivery.files.read","delivery.notes.write"],fileIds:[f.deliveryFiles[agencyIndex].id],expiresAt:new Date(Date.now()+86400000).toISOString()});
 }
 return f;
}
