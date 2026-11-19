import "server-only";
import {databasePool} from "./database.js";
import {requireClientPermission} from "./portal-data.js";
import {normalizeApprovedWebsiteUrl} from "./client-website.js";
import {exactKeys,consoleError,text} from "./platform-console.js";
import {listWebsites,reportHistory} from "./website-insights/store.js";
const overview="client.overview.read";
async function contextFor(headers){const ctx=await requireClientPermission(headers,overview);if(headers.has("x-aoc-client")&&headers.get("x-aoc-client")!==ctx.client.id)throw consoleError("workspace_changed","Reload the current workspace.",409);return ctx;}
export async function readBusiness(headers){
 const ctx=await contextFor(headers);
 const profile=(await databasePool.query("SELECT agency_platform.business_view($1,$2,$3) data",[ctx.user.externalId,ctx.session.session.id,ctx.client.id])).rows[0].data;
 const websites=await listWebsites(ctx),reports=[];
 for(const site of websites){for(const report of await reportHistory(ctx,site.id))if(report.status==="complete")reports.push({...report,websiteName:site.name,websiteId:site.id});}
 reports.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at));
 return {profile,hubstaffConfigured:Boolean(ctx.client.hubstaffProjectUrl),websites,reports:reports.slice(0,20)};
}
export async function saveBusiness(headers,body){
 const ctx=await contextFor(headers);
 exactKeys(body,["description","audience","services","goals","websiteUrl","revision","complete","operation"]);
 const command={};for(const [name,max] of [["description",3000],["audience",2000],["services",2000],["goals",2000]]){const value=body[name];if(typeof value!=="string"||value.length>max||/[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw consoleError("invalid_profile","Use plain text within the field limit.",400);command[name]=value.replace(/\r\n?/g,"\n").trim();}
 try{command.websiteUrl=normalizeApprovedWebsiteUrl(text(body.websiteUrl,500,true));}catch{throw consoleError("invalid_website","Use a public HTTPS website URL.",400);}
 command.revision=text(body.revision,19);command.operation=text(body.operation,36);command.complete=body.complete;
 if(!/^\d+$/.test(command.revision)||!/^[a-f0-9-]{36}$/i.test(command.operation)||typeof command.complete!=="boolean")throw consoleError("invalid_profile","Check the profile revision and completion setting.",400);
 await databasePool.query("SELECT agency_platform.business_save($1,$2,$3,$4::jsonb)",[ctx.user.externalId,ctx.session.session.id,ctx.client.id,JSON.stringify(command)]);
 return {saved:true};
}
