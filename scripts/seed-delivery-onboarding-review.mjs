// Synthetic local review only; never sends real email or uses remote databases.
import pg from "pg";
import {randomUUID} from "node:crypto";
import {mkdir,writeFile,access} from "node:fs/promises";
import {fileURLToPath} from "node:url";
import {createDeliveryOnboardingFixture} from "./delivery-onboarding-fixture.mjs";
import {STARTER_PROFILES} from "../lib/delivery-profile-policy.js";
const directory=new URL("../.tmp/delivery-onboarding-review/",import.meta.url);
async function main(){
 const [flag,name,...rest]=process.argv.slice(2),url=new URL(process.env.AGENCY_MIGRATION_DATABASE_URL),runtime=new URL(process.env.DATABASE_URL),origin=new URL(process.env.BETTER_AUTH_URL);
 if(flag!=="--confirm-database"||rest.length||url.hostname!=="127.0.0.1"||runtime.host!==url.host||runtime.pathname!==url.pathname||url.pathname!=="/"+name||!/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(name)||origin.origin!=="http://127.0.0.1:3006"||process.env.PORTAL_ACCOUNT_SECURITY_ENABLED!=="true"||process.env.AUTH_MAIL_MODE!=="capture")throw Error("Require matching approved disposable database, runtime and private capture configuration.");
 try{await access(new URL("accounts.json",directory));throw Error("Preserve the existing review accounts; use a fresh private review directory or the retained environment.");}catch(error){if(error.code!=="ENOENT")throw error;}
 const db=new pg.Client({connectionString:url.href});const {createPortalAuth,closeAuthDatabase}=await import("../lib/auth.js");
 try{
  await db.connect();const identity=(await db.query("SELECT current_database() name,host(inet_server_addr()) host")).rows[0];if(identity.host!=="127.0.0.1"||identity.name!==name)throw Error("Unexpected target.");
  if(!(await db.query("SELECT 1 FROM agency_platform.schema_migrations WHERE version='014_delivery_onboarding'")).rowCount)throw Error("Apply Stage16A using the explicit operator migration first.");
  const f=await createDeliveryOnboardingFixture(db,createPortalAuth({allowAccountCreation:true,useNextCookies:false}),origin.origin);f.profiles=[];f.runs=[];
  for(const i of [0,1]){
   const a=f.accounts[i?"ownerB":"ownerA"],agency=f.agencies[i],profileId=randomUUID();
   const apply=async c=>(await db.query("SELECT agency_platform.onboarding_admin_change($1,$2,$3,$4::jsonb) data",[a.accountIdentifier,a.session,agency.id,JSON.stringify({reason:"Synthetic role guidance review",operation:randomUUID(),...c})])).rows[0].data;
   await apply({action:"profile.save",operation:profileId,revision:"0",fields:{...STARTER_PROFILES[i].fields,name:i?"Summit SEO onboarding":"Harbor development onboarding"}});await apply({action:"profile.approve",id:profileId,revision:"1"});f.profiles.push(profileId);
   f.runs.push((await apply({action:"run.assign",profileId,profileRevision:"1",clientId:f.clients[i?2:0].id,userId:f.accounts[i?"staffB":"staffA"].id,reviewOwner:a.id,assignmentId:null,expiresAt:new Date(Date.now()+86400000).toISOString()})).id);
  }
  await mkdir(directory,{recursive:true});await writeFile(new URL("accounts.json",directory),JSON.stringify(f,null,2),{flag:"wx",mode:0o600});
  console.log("Synthetic review prepared. Private accounts: "+fileURLToPath(new URL("accounts.json",directory))+". Review /admin/agency/onboarding and /onboarding on loopback port3006.");
 }finally{await closeAuthDatabase();await db.end();}
}
main().catch(()=>{console.error("Local onboarding review setup stopped. Verify the dedicated target, Stage16A migration and private capture prerequisites. Existing accounts are never overwritten.");process.exitCode=1;});
