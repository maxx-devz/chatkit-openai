import "server-only";
import {databasePool} from "./database.js";
import {assertAgencyReview,agencyAdministration} from "./agency-administration.js";
import {consoleSession,consoleError,exactKeys,text,platformError,platformResponse,consoleMutation} from "./platform-console.js";
export {platformError,platformResponse,consoleMutation};
function uuid(value){if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw consoleError("invalid_input","Invalid assignment identifier.",400);return value;}
const fields={"engagement.create":["account","reference"],"engagement.link":["id","account"],"engagement.end":["id"],"assignment.create":["engagementId","clientId","workType","actions","fileIds","role","responsibilities","deliverables","handoff","reviewOwner","expiresAt"],"assignment.replace":["id","revision","engagementId","clientId","workType","actions","fileIds","role","responsibilities","deliverables","handoff","reviewOwner","expiresAt"],"assignment.revoke":["id","revision"]};
async function session(headers){assertAgencyReview();return consoleSession(headers);}
export async function specialistAdministration(headers,agency){
 const data=await agencyAdministration(headers,{agency});
 if(!data.selected)return data;
 if(data.actor.role!=="agency_admin")throw consoleError("agency_approval_required","An agency administrator must approve specialist access.");
 const c=await session(headers);
 const result=(await databasePool.query("SELECT agency_platform.specialist_admin_view($1,$2,$3) data",[c.actor,c.session,data.agency.id])).rows[0].data;
 return {...data,...result};
}
export async function changeSpecialistAssignment(headers,body,agency){
 const data=await specialistAdministration(headers,agency),c=await session(headers);
 if(!data.selected||!Object.hasOwn(fields,body.action))throw consoleError("invalid_input","Select an agency and supported action.",400);
 exactKeys(body,["action","operation","reason",...fields[body.action]]);
 const command={...body,operation:uuid(body.operation),reason:text(body.reason,200)};
 if(command.reason.length<3)throw consoleError("invalid_input","Provide an approval reason.",400);
 for(const key of ["id","engagementId"])if(key in command)command[key]=uuid(body[key]);
 for(const [key,max] of [["account",200],["reference",100],["revision",20],["clientId",18],["workType",20],["role",100],["responsibilities",1000],["deliverables",1000],["reviewOwner",18]])if(key in body)command[key]=text(body[key],max,key==='account'&&body.action==='engagement.create');
 if(body.action.startsWith("assignment.")&&body.action!=="assignment.revoke"){
  command.handoff=text(body.handoff||"",1000,true);
  if(!/^[1-9][0-9]*$/.test(command.clientId)||!/^[1-9][0-9]*$/.test(command.reviewOwner)||!["development","design","seo","content","operations"].includes(command.workType))throw consoleError("invalid_input","Invalid delivery scope.",400);
  if(!Array.isArray(body.actions)||!body.actions.includes("delivery.read")||body.actions.length>3||body.actions.some(x=>!["delivery.read","delivery.files.read","delivery.notes.write"].includes(x))||!Array.isArray(body.fileIds)||body.fileIds.length>20||body.fileIds.some(x=>typeof x!=="string"||!/^[a-zA-Z0-9_-]{1,100}$/.test(x)))throw consoleError("invalid_input","Select only permitted delivery actions and files.",400);
  command.actions=[...new Set(body.actions)].sort();command.fileIds=[...new Set(body.fileIds)].sort();
  const expiry=new Date(body.expiresAt);if(!Number.isFinite(expiry.valueOf()))throw consoleError("invalid_input","Choose a valid expiry.",400);command.expiresAt=expiry.toISOString();
 }
 return (await databasePool.query("SELECT agency_platform.specialist_admin_change($1,$2,$3,$4::jsonb) data",[c.actor,c.session,data.agency.id,JSON.stringify(command)])).rows[0].data;
}
export async function specialistDelivery(headers,assignment){
 const c=await session(headers);
 return (await databasePool.query("SELECT agency_platform.specialist_delivery($1,$2,$3) data",[c.actor,c.session,assignment?uuid(assignment):null])).rows[0].data;
}
export async function specialistFile(headers,assignment,id){
 const c=await session(headers);
 const file=(await databasePool.query("SELECT * FROM agency_platform.specialist_file($1,$2,$3,$4)",[c.actor,c.session,uuid(assignment),text(id,100)])).rows[0];
 if(!file)throw consoleError("file_unavailable","File unavailable.",404);return file;
}
export async function specialistNote(headers,body){
 const c=await session(headers);exactKeys(body,["assignmentId","operation","body"]);
 await databasePool.query("SELECT agency_platform.specialist_note($1,$2,$3,$4,$5)",[c.actor,c.session,uuid(body.assignmentId),uuid(body.operation),text(body.body,1000)]);return {saved:true};
}
// For background/tool consumers: check before starting, at each protected write
// and before delivering output. No job queue or general ChatKit right is granted.
export async function withSpecialistWork(headers,assignment,action,work){
 const c=await session(headers),id=uuid(assignment);
 const check=async(db=databasePool)=>{await db.query("SELECT agency_platform.specialist_scope($1,$2,$3,$4)",[c.actor,c.session,id,action]);};
 const evidence=async()=>{await check();return (await databasePool.query("SELECT agency_platform.specialist_evidence($1,$2,$3) data",[c.actor,c.session,id])).rows[0].data;};
 const write=async apply=>{const db=await databasePool.connect();try{await db.query("BEGIN");await check(db);const result=await apply(db);await check(db);await db.query("COMMIT");return result;}catch(error){await db.query("ROLLBACK");throw error;}finally{db.release();}};
 await check();const result=await work({check,write,evidence});await check();return result;
}
