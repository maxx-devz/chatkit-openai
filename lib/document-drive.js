import "server-only";
import {randomBytes,randomUUID} from "node:crypto";
import {OAuth2Client} from "google-auth-library";
import {databasePool as db} from "./database.js";
import {sealDriveValue,unsealDriveValue,digestDriveValue,DRIVE_SCOPE} from "./drive-source-policy.js";
import {assignmentError,assignmentId} from "./client-document-assignment-policy.js";
import {documentConfig,checkDocument,MAX_DOCUMENT_BYTES,restrictedDocumentName} from "./document-delivery-policy.js";
import {adminDocumentTransaction} from "./document-delivery-access.js";
const oauth=c=>new OAuth2Client({clientId:c.clientId,clientSecret:c.clientSecret,redirectUri:c.redirectUri,transporterOptions:{timeout:12000,retry:false}});
const purpose=(owner,generation,c)=>`client-documents:${owner}:${generation}:${c.hash}`;
export async function documentConnectionStatus(owner){
 let c;try{c=documentConfig();}catch(e){return {configured:false,connected:false,message:e.publicDetails?.message||"Private Google document configuration needs attention."};}
 const row=(await db.query("SELECT config_hash FROM portal_document_connections WHERE owner_id=$1",[owner])).rows[0];
 return {configured:true,connected:row?.config_hash===c.hash,message:row?.config_hash===c.hash?"Google authorization saved. File access is checked when reviewed or opened.":"Connect the approved Google account for client document delivery.",redirectUri:c.redirectUri};
}
export async function beginDocumentGoogle(actor){
 const c=documentConfig(),state=randomBytes(32).toString("base64url"),verifier=randomBytes(48).toString("base64url"),hash=digestDriveValue(state);
 await adminDocumentTransaction(actor,null,async d=>{
  await d.query("SELECT pg_advisory_xact_lock(734901,$1::int)",[actor.admin.id]);
  const prior=(await d.query("SELECT generation FROM portal_document_connections WHERE owner_id=$1",[actor.admin.id])).rows[0];
  const event=(await d.query("SELECT COALESCE(MAX(id),0)::text event FROM portal_document_connection_audit WHERE owner_id=$1",[actor.admin.id])).rows[0].event;
  await d.query("DELETE FROM portal_document_oauth_states WHERE owner_id=$1 OR expires_at<now()",[actor.admin.id]);
  await d.query("INSERT INTO portal_document_oauth_states(state_hash,owner_id,session_hash,encrypted_verifier,prior_generation,prior_event,config_hash,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '10 minutes')",[hash,actor.admin.id,digestDriveValue(actor.session.session.id),sealDriveValue(verifier,'document-oauth:'+hash,c.secret),prior?.generation||null,event,c.hash]);
 });
 return {state,url:oauth(c).generateAuthUrl({access_type:"offline",prompt:"consent",include_granted_scopes:false,scope:["openid","email",DRIVE_SCOPE],state,login_hint:c.email,code_challenge:digestDriveValue(verifier),code_challenge_method:"S256"}),secure:c.origin.startsWith("https:")};
}
export async function finishDocumentGoogle(actor,state,cookie,code){
 const c=documentConfig();if(!/^[\w-]{43}$/.test(state||"")||state!==cookie||!code||code.length>4096)throw assignmentError("oauth_invalid","Google sign-in expired or does not match this browser.",403);
 const hash=digestDriveValue(state),saved=(await db.query("DELETE FROM portal_document_oauth_states WHERE state_hash=$1 AND owner_id=$2 AND session_hash=$3 AND config_hash=$4 AND expires_at>now() RETURNING *",[hash,actor.admin.id,digestDriveValue(actor.session.session.id),c.hash])).rows[0];
 if(!saved)throw assignmentError("oauth_invalid","Start Google sign-in again.",403);
 const client=oauth(c),verifier=unsealDriveValue(saved.encrypted_verifier,'document-oauth:'+hash,c.secret);
 const {tokens}=await client.getToken({code,codeVerifier:verifier});
 if(!tokens.id_token||!tokens.refresh_token||!String(tokens.scope||"").split(/\s+/).includes(DRIVE_SCOPE))throw assignmentError("oauth_scope","Approve read-only Drive access for the configured account.",403);
 const identity=(await client.verifyIdToken({idToken:tokens.id_token,audience:c.clientId})).getPayload();
 if(identity?.email_verified!==true||String(identity?.email||"").toLowerCase()!==c.email)throw assignmentError("oauth_account","Sign in with the approved Google account.",403);
 const generation=randomUUID();
 await adminDocumentTransaction(actor,null,async d=>{
  await d.query("SELECT pg_advisory_xact_lock(734901,$1::int)",[actor.admin.id]);
  const prior=(await d.query("SELECT generation FROM portal_document_connections WHERE owner_id=$1 FOR UPDATE",[actor.admin.id])).rows[0];
  const event=(await d.query("SELECT COALESCE(MAX(id),0)::text event FROM portal_document_connection_audit WHERE owner_id=$1",[actor.admin.id])).rows[0].event;
  if(event!==String(saved.prior_event)||(prior?.generation||null)!==saved.prior_generation)throw assignmentError("oauth_changed","The connection changed during sign-in. Start again.",409);
  await d.query("INSERT INTO portal_document_connections(owner_id,generation,config_hash,encrypted_refresh_token) VALUES($1,$2,$3,$4) ON CONFLICT(owner_id) DO UPDATE SET generation=EXCLUDED.generation,config_hash=EXCLUDED.config_hash,encrypted_refresh_token=EXCLUDED.encrypted_refresh_token,connected_at=now()",[actor.admin.id,generation,c.hash,sealDriveValue(tokens.refresh_token,purpose(actor.admin.id,generation,c),c.secret)]);
  await d.query("INSERT INTO portal_document_connection_audit(owner_id,action) VALUES($1,'connect')",[actor.admin.id]);
 });
}
export async function disconnectDocumentGoogle(actor){
 await adminDocumentTransaction(actor,null,async d=>{await d.query("SELECT pg_advisory_xact_lock(734901,$1::int)",[actor.admin.id]);await d.query("DELETE FROM portal_document_connections WHERE owner_id=$1",[actor.admin.id]);await d.query("DELETE FROM portal_document_oauth_states WHERE owner_id=$1",[actor.admin.id]);await d.query("INSERT INTO portal_document_connection_audit(owner_id,action) VALUES($1,'disconnect')",[actor.admin.id]);});
}
export async function openDocumentDrive(owner,generation){
 const c=documentConfig(),row=(await db.query("SELECT * FROM portal_document_connections WHERE owner_id=$1",[owner])).rows[0];
 if(!row||row.config_hash!==c.hash||generation&&row.generation!==assignmentId(generation))throw assignmentError("google_not_connected","Document Google access needs reconnection and release approval.",409);
 const client=oauth(c);
 try{client.setCredentials({refresh_token:unsealDriveValue(row.encrypted_refresh_token,purpose(owner,row.generation,c),c.secret)});}catch{throw assignmentError("google_key_changed","The saved Google authorization needs reconnection.",503);}
 async function request(url,signal){
  let access;try{access=(await client.getAccessToken()).token;}catch{throw assignmentError("google_revoked","Google authorization expired or was revoked. Ask your AOC team to reconnect.",409);}
  if(!access)throw assignmentError("google_revoked","Google authorization needs reconnection.",409);
  const r=await fetch(url,{headers:{Authorization:'Bearer '+access},redirect:'error',cache:'no-store',signal:AbortSignal.any([AbortSignal.timeout(15000),...(signal?[signal]:[])])});
  if(!r.ok){await r.body?.cancel();throw assignmentError("google_unavailable",[401,403,404].includes(r.status)?"Google no longer permits this document. Please contact your AOC team.":"Google could not deliver this document. Please retry later.",r.status===429?429:409);}
  return r;
 }
 async function metadata(id,signal){
  if(!/^[A-Za-z0-9_-]{10,200}$/.test(id))throw assignmentError('invalid_file','Invalid document reference.');
  const u=new URL('https://www.googleapis.com/drive/v3/files/'+id);u.searchParams.set('fields','id,name,mimeType,parents,trashed,modifiedTime,version,size,capabilities(canDownload)');u.searchParams.set('supportsAllDrives','true');
  return (await request(u,signal)).json();
 }
 async function file(assignment,id,signal){
  const f=await metadata(id,signal);checkDocument(f);
  if(f.id!==id)throw assignmentError('file_unavailable','Document unavailable.',404);
  if(assignment.kind==='document'){if(f.id!==assignment.drive_id)throw assignmentError('file_unavailable','Document not assigned to this client.',404);}
  else {const root=await metadata(assignment.drive_id,signal);if(root.id!==assignment.drive_id||restrictedDocumentName(root.name)||root.trashed||root.mimeType!=='application/vnd.google-apps.folder'||!f.parents?.includes(root.id))throw assignmentError('file_unavailable','Document is outside the approved client folder.',404);}
  return f;
 }
 async function list(assignment,signal){
  if(assignment.kind==='document')return [await file(assignment,assignment.drive_id,signal)];
  const root=await metadata(assignment.drive_id,signal);if(root.id!==assignment.drive_id||restrictedDocumentName(root.name)||root.trashed||root.mimeType!=='application/vnd.google-apps.folder')throw assignmentError('folder_unavailable','Approved client folder unavailable.',409);
  const u=new URL('https://www.googleapis.com/drive/v3/files');u.searchParams.set('q',"'"+assignment.drive_id+"' in parents and trashed=false");u.searchParams.set('fields','nextPageToken,incompleteSearch,files(id,name,mimeType,parents,trashed,modifiedTime,version,size,capabilities(canDownload))');u.searchParams.set('pageSize','100');u.searchParams.set('supportsAllDrives','true');u.searchParams.set('includeItemsFromAllDrives','true');
  const page=await(await request(u,signal)).json();
  const files=(page.files||[]).filter(f=>{try{checkDocument(f);return f.parents?.includes(root.id);}catch{return false;}});
  return {files,truncated:Boolean(page.nextPageToken||page.incompleteSearch)};
 }
 async function bytes(f,format,signal){
  const u=new URL('https://www.googleapis.com/drive/v3/files/'+f.id+(format.native?'/export':''));
  if(format.native)u.searchParams.set('mimeType','application/pdf');else {u.searchParams.set('alt','media');u.searchParams.set('supportsAllDrives','true');}
  const r=await request(u,signal),reader=r.body?.getReader();if(!reader)throw assignmentError('empty_file','Document is empty.',502);
  let size=0;const parts=[];try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.byteLength;if(size>MAX_DOCUMENT_BYTES){await reader.cancel();throw assignmentError('document_too_large','Document exceeds the 4 MB delivery limit.',413);}parts.push(Buffer.from(value));}}finally{reader.releaseLock();}
  if(!size)throw assignmentError('empty_file','Document is empty.',502);const data=Buffer.concat(parts);
  if(format.mime==='application/pdf'&&data.subarray(0,5).toString()!=='%PDF-')throw assignmentError('invalid_pdf','Google returned an invalid PDF.',502);
  return data;
 }
 return {generation:row.generation,hash:c.hash,file,list,bytes};
}
