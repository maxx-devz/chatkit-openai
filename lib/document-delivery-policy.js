import {createHash} from "node:crypto";
import {assignmentError,assignmentText,assignmentId,clientId} from "./client-document-assignment-policy.js";
export const DOCUMENT_CALLBACK="/api/admin/client-documents/google/callback";
export const MAX_DOCUMENT_BYTES=4*1024*1024;
import {DOCUMENT_CATEGORIES} from "./client-document-categories.js";
export {DOCUMENT_CATEGORIES};
const native=["document","spreadsheet","presentation"].map(v=>"application/vnd.google-apps."+v);
const types={"application/pdf":"pdf","image/png":"png","image/jpeg":"jpg","image/webp":"webp","text/plain":"txt",
 "application/vnd.openxmlformats-officedocument.wordprocessingml.document":"docx",
 "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet":"xlsx",
 "application/vnd.openxmlformats-officedocument.presentationml.presentation":"pptx"};
export function documentFormat(mime){
 if(native.includes(mime))return {mime:"application/pdf",extension:"pdf",native:true,inline:true};
 if(!types[mime])throw assignmentError("unsupported_document","Use PDF, Google Docs/Sheets/Slides, a standard Office document, plain text or PNG/JPEG/WebP.",415);
 return {mime,extension:types[mime],native:false,inline:["application/pdf","image/png","image/jpeg","image/webp","text/plain"].includes(mime)};
}
export function restrictedDocumentName(name){return /\b(draft|savepoint|internal|restricted|superseded|archive[ds]?|payroll|coaching|candidate)\b/i.test(String(name));}
export function checkDocument(file){
 if(!file||file.trashed||file.capabilities?.canDownload!==true||!/^[0-9]{1,30}$/.test(String(file.version||""))||!file.modifiedTime||!file.name||file.name.length>240||/[<>\x00-\x1f]/.test(file.name)
   ||restrictedDocumentName(file.name))throw assignmentError("file_not_eligible","This file is restricted, unavailable or not ready for a client release.",403);
 if(Number(file.size)>MAX_DOCUMENT_BYTES)throw assignmentError("document_too_large","This document is larger than the 4 MB delivery limit.",413);
 return documentFormat(file.mimeType);
}
export function verifyReleasedFile(file,release){
 checkDocument(file);
 if(file.id!==release.drive_id||String(file.version)!==release.drive_version||file.modifiedTime!==release.modified_time||file.name!==release.source_name||file.mimeType!==release.mime_type)throw assignmentError("document_changed","This document changed and needs a new approval. Please contact your AOC team.",409);
}
export function documentFilename(title,format){return (String(title).normalize("NFKC").replace(/[^a-zA-Z0-9 ._-]/g,"_").replace(/^[. ]+|[. ]+$/g,"").slice(0,110)||"Document")+"."+format.extension;}
export function documentConfig(env=process.env){
 const names=["CLIENT_DOCUMENTS_GOOGLE_CLIENT_ID","CLIENT_DOCUMENTS_GOOGLE_CLIENT_SECRET","CLIENT_DOCUMENTS_ENCRYPTION_KEY","CLIENT_DOCUMENTS_ALLOWED_EMAIL"];
 const missing=names.filter(k=>!env[k]?.trim());if(missing.length)throw assignmentError("google_setup_required","Complete private document Google settings: "+missing.join(", "),503);
 let origin;try{origin=new URL(env.BETTER_AUTH_URL||"");}catch{throw assignmentError("google_setup_required","Configure the exact portal origin.",503);}
 if(origin.username||origin.password||origin.search||origin.hash||origin.pathname!=="/"||!(origin.protocol==="https:"||origin.protocol==="http:"&&["localhost","127.0.0.1"].includes(origin.hostname)))throw assignmentError("google_setup_required","Configure the exact portal origin.",503);
 const c={clientId:env[names[0]].trim(),clientSecret:env[names[1]].trim(),secret:env[names[2]].trim(),email:env[names[3]].trim().toLowerCase(),origin:origin.origin};
 if(!/^[\w.-]+\.apps\.googleusercontent\.com$/.test(c.clientId)||c.secret.length<32||! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email))throw assignmentError("google_setup_required","Check the document Google OAuth client, allowed account and stable encryption key.",503);
 c.redirectUri=c.origin+DOCUMENT_CALLBACK;
 c.hash=createHash("sha256").update(JSON.stringify([c.clientId,c.email,c.redirectUri])).digest("hex");return c;
}
export function deliveryCommand(b){
 const allowed={publish:["assignmentId","assignmentRevision","driveId","driveVersion","title","category","stage","confirmed"],revoke:["id"],journey:["revision","currentStage","completed","stageLabels","nextAction","evidenceType","evidenceSummary","confirmed"]};
 const fields=allowed[b?.action];if(!fields||Object.keys(b).some(k=>!["action","clientId","operation","reason",...fields].includes(k)))throw assignmentError("invalid_fields","Unsupported document action or fields.");
 const c={action:b.action,clientId:clientId(b.clientId),operation:assignmentId(b.operation),reason:assignmentText(b.reason,400)};
 if(b.action==="revoke")return {...c,id:assignmentId(b.id)};
 if(b.confirmed!==true)throw assignmentError("approval_required","Confirm the client-facing release or verified milestone before saving.");
 if(b.action==="publish"){
  if(!/^[A-Za-z0-9_-]{10,200}$/.test(b.driveId||"")||! /^[0-9]{1,30}$/.test(b.driveVersion||"")||! /^[1-9][0-9]{0,14}$/.test(b.assignmentRevision||"")||!Object.hasOwn(DOCUMENT_CATEGORIES,b.category)||!Number.isInteger(b.stage)||b.stage<1||b.stage>7)throw assignmentError("invalid_release","Select the current file, category and journey stage.");
  return {...c,assignmentId:assignmentId(b.assignmentId),assignmentRevision:b.assignmentRevision,driveId:b.driveId,driveVersion:b.driveVersion,title:assignmentText(b.title,180),category:b.category,stage:b.stage};
 }
 if(! /^[0-9]{1,15}$/.test(b.revision||"")||!Number.isInteger(b.currentStage)||b.currentStage<1||b.currentStage>7||typeof b.completed!=="boolean"||b.completed&&b.currentStage!==7||!Array.isArray(b.stageLabels)||b.stageLabels.length!==7||!["milestone","approval","billing"].includes(b.evidenceType))throw assignmentError("invalid_journey","Select valid verified progress and all seven stage names.");
 return {...c,revision:b.revision,currentStage:b.currentStage,completed:b.completed,stageLabels:b.stageLabels.map(v=>assignmentText(v,100)),nextAction:assignmentText(b.nextAction,700,false),evidenceType:b.evidenceType,evidenceSummary:assignmentText(b.evidenceSummary,700)};
}
