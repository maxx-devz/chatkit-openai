// Delivery guidance only. These fields never create memberships, tools or grants.
export const PROFILE_FIELDS = {
 name: ["Profile name",120], specialty:["Core specialty",1000], adjacentWork:["Relevant adjacent work",1000],
 tools:["Tools already used by the team",1000], clientContext:["Client context to confirm",1500],
 aiGuidance:["Approved AI use — guidance only",1500], excludedResponsibilities:["Excluded responsibilities",1500],
 deliverables:["Expected deliverables",1500], reviewOwnerGuidance:["Review responsibilities",1000], successCriteria:["Success criteria",1500],
 businessKnowledge:["Approved business knowledge to review",1500], agencyStandards:["Agency standards to review",1500],
 accessRequests:["Access to request from your reviewer",1000], firstTask:["Small first task for review",1500], externalToolUrl:["Existing work tool link (optional)",500]
};
export const ONBOARDING_STEPS={businessKnowledge:"Review approved business knowledge",agencyStandards:"Review agency standards",accessRequests:"Confirm or request required access",firstTask:"Prepare a small first task for review"};
export const STEP_STATES={todo:"Not started",in_progress:"In progress",blocked:"Blocked",complete:"Completed by participant"};
export function validateProfile(input){
 if(!input||typeof input!=="object"||Array.isArray(input)||Object.keys(input).some(key=>!Object.hasOwn(PROFILE_FIELDS,key)))throw Error("Use supported delivery guidance fields only.");
 const result={};for(const [key,[,max]] of Object.entries(PROFILE_FIELDS)){const value=input[key]??"";if(typeof value!=="string"||value.length>max||/[<>\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value))throw Error("Use bounded plain text for delivery guidance.");result[key]=value.replace(/\r\n?/g,"\n").trim();}
 if(result.externalToolUrl){let url;try{url=new URL(result.externalToolUrl);}catch{throw Error("Use a public HTTPS work-tool link.");}if(url.protocol!=="https:"||url.username||url.password||!url.hostname.includes(".")||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/i.test(url.hostname)||url.hostname.includes(":"))throw Error("Use a public HTTPS work-tool link.");result.externalToolUrl=url.href;}
 return result;
}
export const STARTER_PROFILES=[
 ["development","Development","Review an approved change","One small change in the customer's existing development tool","Change follows the agreed acceptance criteria"],
 ["seo","SEO","Review approved website evidence","One evidence-backed improvement recommendation","Recommendation cites permitted observations and their dates"],
 ["design","Design","Review an approved design brief","One small design proposal for review","Proposal matches the supplied brief and accessibility requirements"],
 ["reporting","Reporting","Summarize an approved report","One concise report summary with evidence dates","Summary distinguishes measured values from unavailable information"]
].map(([id,name,specialty,deliverables,successCriteria])=>({id,fields:validateProfile({name:`Fictional ${name} starter`,specialty,deliverables,successCriteria,
 adjacentWork:"Confirm relevant adjacent work with the reviewer; no assumed qualifications.",tools:"Use the customer's existing approved tools. No integration is implied.",clientContext:"Confirm the approved business profile and delivery scope.",aiGuidance:"Use only permitted business evidence. No additional AI or tool permission is granted.",excludedResponsibilities:"Unapproved disciplines, personnel records, payroll, recruitment and private coaching information.",reviewOwnerGuidance:"The agency chooses priorities and an authorized review owner.",businessKnowledge:"Review only business materials already approved for this assignment.",agencyStandards:"Ask the reviewer for the agency's approved delivery standards.",accessRequests:"Record missing access and contact the reviewer through the existing tool. This checklist grants no access.",firstTask:deliverables})}));
