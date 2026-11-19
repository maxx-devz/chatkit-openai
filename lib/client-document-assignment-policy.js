// Pure validation shared by the server and tests. A saved reference is not a grant.
export const JOURNEY_STAGE_LABELS = ["Inquiry & fit", "Audit order & payment", "Discover your process", "Audit & build decision", "Implementation readiness", "Build & test", "Launch & handover"];
export function assignmentError(code, message, status = 400) {
  return Object.assign(new Error(message), {publicDetails:{code, message, status}});
}
export function assignmentId(value) {
  if(typeof value!=="string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value))throw assignmentError("invalid_reference","Choose a saved assignment.");
  return value.toLowerCase();
}
export function clientId(value) {
  if(typeof value!=="string" || !/^[1-9][0-9]{0,14}$/.test(value))throw assignmentError("invalid_client","Choose a client.");
  return value;
}
export function assignmentText(value,max,required=true) {
  if(typeof value!=="string" || value.trim().length>max || (required&&!value.trim()) || /[<>\x00-\x1f\x7f]/.test(value))throw assignmentError("invalid_field","Use plain text within the field limit.");
  return value.trim();
}
export function parseDriveReference(value) {
  let u;
  try {u=new URL(value);}catch {throw assignmentError("invalid_drive_link","Paste a complete Google Drive or Google Docs link.");}
  if(u.protocol!=="https:"||u.username||u.password||u.port||!["drive.google.com","docs.google.com"].includes(u.hostname))throw assignmentError("invalid_drive_link","Use an HTTPS link from Google Drive, Docs, Sheets or Slides.");
  let id,type,path;
  if(u.hostname==="drive.google.com"){
    const folder=u.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([A-Za-z0-9_-]{10,200})\/?$/);
    const file=u.pathname.match(/^\/file\/d\/([A-Za-z0-9_-]{10,200})(?:\/(?:view|preview|edit))?\/?$/);
    if(folder){id=folder[1];type="folder";path="/drive/folders/"+id;}
    else if(file){id=file[1];type="document";path="/file/d/"+id+"/view";}
  }else{
    const doc=u.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([A-Za-z0-9_-]{10,200})(?:\/(?:edit|view|preview))?\/?$/);
    if(doc){id=doc[2];type="document";path="/"+doc[1]+"/d/"+id+"/edit";}
  }
  if(!id)throw assignmentError("invalid_drive_link","Use the direct file or folder link, not a sharing invitation or sign-in link.");
  // Strip account selectors, resource keys, fragments and query parameters.
  return {driveId:id,kind:type,url:u.origin+path};
}
export function validateAssignment(body) {
  const allowed=["action","clientId","id","revision","title","url","stage","reason","operation"];
  if(!body||typeof body!=="object"||Array.isArray(body)||Object.keys(body).some(k=>!allowed.includes(k)))throw assignmentError("invalid_fields","Unsupported assignment fields.");
  const base={action:body.action,clientId:clientId(body.clientId),operation:assignmentId(body.operation),reason:assignmentText(body.reason,400)};
  if(!["save","archive"].includes(base.action))throw assignmentError("invalid_action","Choose save or remove.");
  if(body.id){base.id=assignmentId(body.id);if(typeof body.revision!=="string"||! /^[1-9][0-9]{0,14}$/.test(body.revision))throw assignmentError("invalid_revision","Reload the saved assignment before editing.");base.revision=body.revision;}
  if(base.action==="archive"){if(!base.id)throw assignmentError("invalid_reference","Choose a saved assignment.");return base;}
  const stage=body.stage===""||body.stage===null?null:body.stage;
  if(stage!==null&&(!Number.isInteger(stage)||stage<1||stage>7))throw assignmentError("invalid_stage","Choose a journey stage, or leave it unassigned.");
  return {...base,title:assignmentText(body.title,180),stage,...parseDriveReference(body.url)};
}
