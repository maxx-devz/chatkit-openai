import {createAudit} from "../lib/website-insights/audit.js";
import {randomBytes,randomUUID} from "node:crypto";
import {prepareAccountSecurity} from "../tests/account-security/fixture.mjs";
// Synthetic data only. No current client, provider token, source or history is changed.
export async function createBusinessFixture(db,auth,origin){
 const actual=(await db.query("SELECT current_database() name,host(inet_server_addr()) host")).rows[0];
 if(actual.host!=="127.0.0.1"||!/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(actual.name)||new URL(origin).hostname!=="127.0.0.1")throw Error("Require disposable synthetic loopback database");
 const agency=(await db.query("SELECT a.id::text,a.slug FROM agency_platform.agencies a JOIN agency_platform.backfill_state b ON b.aoc_agency_id=a.id")).rows[0];
 if(!agency|| (await db.query("SELECT 1 FROM agency_platform.agency_governance WHERE agency_id=$1",[agency.id])).rowCount)throw Error("Use a fresh synthetic AOC fixture");
 const f={origin,database:"/"+actual.name,agency,accounts:{},clients:[]};
 for(const key of ["aocOwner","businessA","businessB","viewer","member","multi"]){
  const username="s16."+key.toLowerCase()+"."+randomBytes(5).toString("hex"),password=randomBytes(24).toString("hex");
  const created=await auth.api.signUpEmail({body:{username,password,name:"Synthetic "+key,email:username+"@example.invalid"}});
  const person=(await db.query("INSERT INTO portal_users(external_id,display_name) VALUES($1,$2) RETURNING id::text",[created.user.id,"Synthetic "+key])).rows[0];
  const a=f.accounts[key]={id:person.id,accountIdentifier:created.user.id,username,password};
  await db.query("INSERT INTO agency_platform.memberships(agency_id,user_id,role) VALUES($1,$2,$3)",[agency.id,a.id,key==="aocOwner"?"agency_admin":"client_user"]);
 }
 const owner=f.accounts.aocOwner;
 await db.query("BEGIN");try{await db.query("INSERT INTO agency_platform.agency_owners(agency_id,user_id,assigned_by) VALUES($1,$2,$2)",[agency.id,owner.id]);await db.query("INSERT INTO agency_platform.agency_governance(agency_id,owner_id,enabled) VALUES($1,$2,true)",[agency.id,owner.id]);await db.query("COMMIT");}catch(e){await db.query("ROLLBACK");throw e;}
 await db.query("INSERT INTO portal_admins(user_id,is_active) VALUES($1,true)",[owner.id]);
 await prepareAccountSecurity(db,auth,f,origin);
 for(const [i,key] of ["businessA","businessB"].entries()){
  const revision=(await db.query("SELECT revision::text FROM agency_platform.agency_governance WHERE agency_id=$1",[agency.id])).rows[0].revision;
  const result=(await db.query("SELECT agency_platform.agency_admin_change($1,$2,$3,$4::jsonb) data",[owner.accountIdentifier,owner.session,agency.id,JSON.stringify({action:"client.create",slug:"s16-business-"+i,name:"Fictional Business "+(i+1),revision,operation:randomUUID(),reason:"Synthetic no-Hubstaff onboarding"})])).rows[0].data;
  const client={id:result.clientId,agencyId:agency.id,name:"Fictional Business "+(i+1)};f.clients.push(client);
  await db.query("UPDATE portal_clients SET ai_enabled=true WHERE id=$1",[client.id]);
  for(const [account,role] of [[key,"client_admin"],["multi","client_admin"],...(!i?[["viewer","client_viewer"],["member","member"]]:[])]){
   const a=f.accounts[account];await db.query("INSERT INTO portal_memberships(client_id,user_id,role) VALUES($1,$2,$3)",[client.id,a.id,role]);
   await db.query("INSERT INTO agency_platform.client_access(agency_id,client_id,user_id,access_level) VALUES($1,$2,$3,$4) ON CONFLICT(agency_id,client_id,user_id) DO UPDATE SET access_level=EXCLUDED.access_level,is_active=true",[agency.id,client.id,a.id,role==="client_admin"?"manage":role==="member"?"contribute":"read"]);
  }
 }
 return f;
}

export function businessWebsiteEvidence(url,marker){
 const result=createAudit(url).result;
 result.coverage.note="Synthetic saved report for local review; no website or analytics provider was queried.";
 result.summary={pagesChecked:0,critical:0,warnings:1,opportunities:0,totalFindings:1};
 result.findings=[{id:"synthetic-title",title:marker,category:"seo",kind:"synthetic",severity:"warning",page:url,why:"Fictional example only",recommendation:"Review your real website evidence before acting."}];
 return result;
}
export async function seedBusinessWebsiteReports(db,f){
 const identity=(await db.query("SELECT current_database() name,host(inet_server_addr()) host")).rows[0];
 if(identity.host!=="127.0.0.1"||"/"+identity.name!==f.database||!/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(identity.name))throw Error("Require matching synthetic fixture");
 f.reports=[];
 for(const [i,c] of f.clients.entries()){
  const site=randomUUID(),report=randomUUID(),url=i?"https://birch.example/":"https://orchid.example/",name=i?"Birch synthetic website":"Orchid synthetic website";
  const scoped=(await db.query("SELECT 1 FROM agency_platform.client_ownership WHERE agency_id=$1 AND client_id=$2",[f.agency.id,c.id])).rowCount;if(!scoped)throw Error("Fixture ownership mismatch");
  await db.query("INSERT INTO portal_website_insights_sites(id,client_id,name,url) VALUES($1,$2,$3,$4)",[site,c.id,name,url]);
  await db.query("INSERT INTO portal_website_insights_reports(id,website_id,client_id,status,state,result,finished_at) VALUES($1,$2,$3,'complete','{\"stage\":\"complete\"}',$4,now())",[report,site,c.id,JSON.stringify(businessWebsiteEvidence(url,"Synthetic website title example"))]);f.reports.push({id:report,siteId:site});
 }
 return f;
}
