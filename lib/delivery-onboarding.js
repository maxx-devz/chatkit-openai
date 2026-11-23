import "server-only";
import {databasePool} from "./database.js";
import {assertAgencyReview,selectedAgencyAdministration} from "./agency-administration.js";
import {consoleSession,consoleError,exactKeys,text,platformError,platformResponse,consoleMutation} from "./platform-console.js";
import {validateProfile,ONBOARDING_STEPS,STEP_STATES,STARTER_PROFILES} from "./delivery-profile-policy.js";
import {assertTrustedOrigin,readJsonRequest} from "./request-security.js";
export {platformError,platformResponse,consoleMutation};
export async function onboardingAdminMutation(request,handler){try{assertTrustedOrigin(request.headers);return platformResponse(await handler(request.headers,await readJsonRequest(request,24000)));}catch(error){return platformError(error);}}
function uuid(value){if(typeof value!=="string"||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value))throw consoleError("invalid_input","Invalid delivery identifier.",400);return value;}
function number(value){if(typeof value!=="string"||!/^\d{1,18}$/.test(value))throw consoleError("invalid_input","Invalid delivery revision or account.",400);return value;}
export async function onboardingAdministration(headers,slug){
 const c=await selectedAgencyAdministration(headers,slug);
 if(!c.agency)throw consoleError("selection_required","Choose an agency first.",409);
 const data=(await databasePool.query("SELECT agency_platform.onboarding_admin_view($1,$2,$3) data",[c.actor,c.session,c.agency.id])).rows[0].data;
 const branding=(await databasePool.query("SELECT agency_platform.public_brand($1) data",[c.agency.slug])).rows[0].data;
 return {...data,branding:branding?{...branding,logoUrl:branding.hasLogo?`/api/portal-brand/${branding.slug}/logo?revision=${branding.revision}`:null}:null,starters:STARTER_PROFILES};
}
export async function changeOnboardingAdministration(headers,body,slug){
 const c=await selectedAgencyAdministration(headers,slug);if(!c.agency)throw consoleError("selection_required","Choose an agency first.",409);
 const fields={"profile.save":["id","revision","fields"],"profile.approve":["id","revision"],"profile.retire":["id","revision"],"run.assign":["profileId","profileRevision","clientId","userId","assignmentId","reviewOwner","expiresAt"],"run.revoke":["id","revision"]};
 if(!Object.hasOwn(fields,body.action))throw consoleError("invalid_input","Unsupported delivery action.",400);
 exactKeys(body,["action","operation","reason",...fields[body.action]]);
 const command={...body,operation:uuid(body.operation),reason:text(body.reason,200)};
 if(command.reason.length<3)throw consoleError("invalid_input","Provide an approval reason.",400);
 for(const key of ["id","profileId","assignmentId"])if(command[key])command[key]=uuid(command[key]);
 for(const key of ["revision","profileRevision","clientId","userId","reviewOwner"])if(key in command)command[key]=number(command[key]);
 if(body.action==="profile.save"){try{command.fields=validateProfile(body.fields);}catch(error){throw consoleError("invalid_profile",error.message,400);}}
 if(body.action==="run.assign"){const expiry=new Date(body.expiresAt);if(!Number.isFinite(expiry.valueOf()))throw consoleError("invalid_input","Choose a valid expiry.",400);command.expiresAt=expiry.toISOString();command.assignmentId=body.assignmentId?uuid(body.assignmentId):null;}
 return (await databasePool.query("SELECT agency_platform.onboarding_admin_change($1,$2,$3,$4::jsonb) data",[c.actor,c.session,c.agency.id,JSON.stringify(command)])).rows[0].data;
}
export async function deliveryOnboarding(headers,run){assertAgencyReview();const c=await consoleSession(headers);return (await databasePool.query("SELECT agency_platform.onboarding_view($1,$2,$3) data",[c.actor,c.session,run?uuid(run):null])).rows[0].data;}
export async function updateDeliveryOnboarding(headers,body){
 assertAgencyReview();const c=await consoleSession(headers);exactKeys(body,["id","revision","operation","step","status","note"]);
 if(!Object.hasOwn(ONBOARDING_STEPS,body.step)||!Object.hasOwn(STEP_STATES,body.status))throw consoleError("invalid_input","Choose a supported checklist step and state.",400);
 const command={...body,id:uuid(body.id),operation:uuid(body.operation),revision:number(body.revision),note:text(body.note||"",600,true)};
 return (await databasePool.query("SELECT agency_platform.onboarding_progress($1,$2,$3::jsonb) data",[c.actor,c.session,JSON.stringify(command)])).rows[0].data;
}
