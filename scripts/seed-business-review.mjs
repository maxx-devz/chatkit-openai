import pg from "pg";
import {mkdir,writeFile,access} from "node:fs/promises";
import {approvedDatabaseTarget,safeDatabaseCode} from "./agency-platform-config.mjs";
import {createBusinessFixture,seedBusinessWebsiteReports} from "./business-review-fixture.mjs";
async function main(){
 const [flag,name,...rest]=process.argv.slice(2),runtime=new URL(process.env.DATABASE_URL),operator=new URL(approvedDatabaseTarget(process.env.AGENCY_MIGRATION_DATABASE_URL,name));
 if(flag!=="--confirm-database"||rest.length||runtime.hostname!=="127.0.0.1"||operator.hostname!=="127.0.0.1"||runtime.host!==operator.host||runtime.pathname!==operator.pathname||runtime.username===operator.username||process.env.BETTER_AUTH_URL!=="http://127.0.0.1:3005")throw Error("Require approved disposable business review profile");
 const directory=new URL("../.tmp/business-review/",import.meta.url),output=new URL("accounts.json",directory);
 if(await access(output).then(()=>true,()=>false))throw Error("Preserve existing private review accounts");
 process.env.DATABASE_URL=operator.href;
 const {createPortalAuth,closeAuthDatabase}=await import("../lib/auth.js");
 const db=new pg.Client({connectionString:operator.href});try{await db.connect();
 if(!(await db.query("SELECT 1 FROM agency_platform.schema_migrations WHERE version='013_client_business'")).rowCount)throw Error("Migrate Stage16 first");
 const auth=createPortalAuth({allowAccountCreation:true,useNextCookies:false,operatorDatabase:true});
 const fixture=await createBusinessFixture(db,auth,process.env.BETTER_AUTH_URL);
 await seedBusinessWebsiteReports(db,fixture);
 await mkdir(directory,{recursive:true});await writeFile(output,JSON.stringify(fixture,null,2),{flag:"wx",mode:0o600});
 console.log("Synthetic review identities saved privately in .tmp/business-review/accounts.json; no external messages sent.");
 }finally{await db.end();await closeAuthDatabase();}
}
main().catch(e=>{console.error("Business review seed stopped",safeDatabaseCode(e));process.exitCode=1;});
