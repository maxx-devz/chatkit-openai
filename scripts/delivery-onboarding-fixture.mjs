import {randomBytes,randomUUID} from "node:crypto";
import {prepareAccountSecurity} from "../tests/account-security/fixture.mjs";
export async function createDeliveryOnboardingFixture(db,auth,origin){
 const identity=(await db.query("SELECT current_database() name,host(inet_server_addr()) host")).rows[0];
 if(identity.host!=="127.0.0.1"||!/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(identity.name)||new URL(origin).hostname!=="127.0.0.1")throw Error("Use approved disposable synthetic PostgreSQL.");
 const f={origin,database:"/"+identity.name,accounts:{},agencies:[],clients:[],assignments:[]};
 for(const key of ["ownerA","staffA","ownerB","staffB","specialist","engagementOnly","clientA","multi","internal"]){
  const username="s16a."+key.toLowerCase()+"."+randomBytes(5).toString("hex"),password=randomBytes(24).toString("hex");
  const result=await auth.api.signUpEmail({body:{username,password,name:"Fictional "+key,email:username+"@example.invalid"}});
  const u=(await db.query("INSERT INTO portal_users(external_id,display_name) VALUES($1,$2) RETURNING id::text",[result.user.id,"Fictional "+key])).rows[0];f.accounts[key]={...u,accountIdentifier:result.user.id,username,password};
 }
 for(const [i,label] of ["Harbor","Summit"].entries()){
  const a=(await db.query("INSERT INTO agency_platform.agencies(slug,display_name) VALUES($1,$2) RETURNING id::text,slug,display_name name",["onboarding-"+label.toLowerCase()+"-"+randomBytes(4).toString("hex"),"Fictional "+label+" Delivery"])).rows[0];f.agencies.push(a);
  const owner=f.accounts[i?"ownerB":"ownerA"];
  for(const key of [i?"ownerB":"ownerA",i?"staffB":"staffA","multi",...(i?[]:["specialist","clientA","internal"])])await db.query("INSERT INTO agency_platform.memberships(agency_id,user_id,role) VALUES($1,$2,$3)",[a.id,f.accounts[key].id,key.startsWith("owner")?"agency_admin":key==="clientA"?"client_user":"staff"]);
  await db.query("BEGIN");try{await db.query("INSERT INTO agency_platform.agency_owners(agency_id,user_id,assigned_by) VALUES($1,$2,$2)",[a.id,owner.id]);await db.query("INSERT INTO agency_platform.agency_governance(agency_id,owner_id,enabled) VALUES($1,$2,true)",[a.id,owner.id]);await db.query("COMMIT");}catch(e){await db.query("ROLLBACK");throw e;}
  for(const n of [1,2]){
   const c=(await db.query("INSERT INTO portal_clients(slug,display_name,portal_enabled) VALUES($1,$2,true) RETURNING id::text",[a.slug+"-"+n,label+" Delivery Client "+n])).rows[0];c.agencyId=a.id;f.clients.push(c);await db.query("INSERT INTO agency_platform.client_ownership(agency_id,client_id) VALUES($1,$2)",[a.id,c.id]);
   if(n===1)for(const key of [i?"staffB":"staffA","multi"]){await db.query("INSERT INTO portal_memberships(client_id,user_id,role) VALUES($1,$2,'member')",[c.id,f.accounts[key].id]);await db.query("INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level) VALUES($1,$2,$3,'contribute')",[a.id,c.id,f.accounts[key].id]);}
  }
 }
 await db.query("INSERT INTO portal_internal_users(user_id,hubstaff_user_id,is_active) VALUES($1,991616,false)",[f.accounts.internal.id]);
 await prepareAccountSecurity(db,auth,f,origin);
 const owner=f.accounts.ownerA,agency=f.agencies[0],specialist=f.accounts.specialist;
 for(const [key,user] of [["specialist",specialist],["engagementOnly",f.accounts.engagementOnly]])await db.query("INSERT INTO agency_platform.specialist_engagements(id,agency_id,user_id,reference,created_by) VALUES($1,$2,$3,$4,$5)",[randomUUID(),agency.id,user.id,"Synthetic "+key,owner.id]);
 const engagement=(await db.query("SELECT id FROM agency_platform.specialist_engagements WHERE agency_id=$1 AND user_id=$2",[agency.id,specialist.id])).rows[0].id;
 const command={action:"assignment.create",operation:randomUUID(),reason:"Synthetic narrow delivery approval",engagementId:engagement,clientId:f.clients[0].id,reviewOwner:owner.id,workType:"development",role:"Fictional scoped specialist",responsibilities:"Review approved delivery context",deliverables:"A small change proposal",handoff:"Business delivery only",actions:["delivery.read","delivery.notes.write"],fileIds:[],expiresAt:new Date(Date.now()+7*86400000).toISOString()};
 const assigned=(await db.query("SELECT agency_platform.specialist_admin_change($1,$2,$3,$4::jsonb) data",[owner.accountIdentifier,owner.session,agency.id,JSON.stringify(command)])).rows[0].data;f.assignments.push(assigned.id);
 f.hrCanary="HR_PRIVATE_16A_"+randomBytes(10).toString("hex");await db.query("CREATE TABLE agency_platform.delivery_fixture_hr(secret text NOT NULL)");await db.query("INSERT INTO agency_platform.delivery_fixture_hr VALUES($1)",[f.hrCanary]);
 return f;
}
