import {readFile} from "node:fs/promises";
import {login} from "../tests/account-security/fixture.mjs";
async function main(){
 const u=new URL(process.env.DATABASE_URL),origin=process.env.BETTER_AUTH_URL;
 if(u.hostname!=="127.0.0.1"||!/^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(u.pathname)||origin!=="http://127.0.0.1:3005")throw Error("Require matching synthetic review profile");
 const f=JSON.parse(await readFile(new URL("../.tmp/business-review/accounts.json",import.meta.url),"utf8"));if(f.origin!==origin||f.database!==u.pathname)throw Error("Review fixture mismatch");
 const {createPortalAuth,closeAuthDatabase}=await import("../lib/auth.js");try{
 const auth=createPortalAuth({useNextCookies:false});
 for(const [i,key] of ["businessA","businessB"].entries()){
  const signed=await login(auth,f.accounts[key],origin);const headers={cookie:signed.cookie,origin};
  const result=await fetch(origin+"/api/client/business",{headers,cache:"no-store"});if(result.status!==200)throw Error("Business profile review check failed");
  const body=await result.json();if(body.hubstaffConfigured||body.profile.clientId!==f.clients[i].id)throw Error("Unexpected business workspace");
  const foreign=await fetch(origin+"/api/client/business",{headers:{...headers,"x-aoc-client":f.clients[1-i].id},cache:"no-store"});if(foreign.status===200)throw Error("Foreign workspace was allowed");
 }
 console.log("Both synthetic client logins, unmapped profiles and foreign-client denial verified. Credentials remain in the private account file.");
 }finally{await closeAuthDatabase();}
}
main().catch(()=>{console.error("Business review health check failed; inspect the private local setup.");process.exitCode=1;});
