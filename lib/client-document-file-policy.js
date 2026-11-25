import {createDocumentInspector} from './client-document-formats.js';
import {assignmentError,assignmentId,assignmentText,clientId,documentDescription} from './client-document-assignment-policy.js';
// Legacy multipart/BYTEA transport only. Direct private Storage has no portal per-file cap.
export const DOCUMENT_UPLOAD_MAX=2*1024*1024;
export {DOCUMENT_UPLOAD_ACCEPT} from './client-document-formats.js';
export function validateDocumentFile(filename,content){
 if(!Buffer.isBuffer(content)||!content.length)throw assignmentError('invalid_file','Choose a non-empty file.');
 if(content.length>DOCUMENT_UPLOAD_MAX)throw assignmentError('file_too_large','Use direct private Storage upload for files above the legacy database request limit.',413);
 try{const inspector=createDocumentInspector(filename);inspector.push(content);return inspector.finish();}catch(error){throw assignmentError('file_mismatch',error.message,415);}
}
export async function readDocumentFile(request){
 const type=request.headers.get('content-type')||'',limit=DOCUMENT_UPLOAD_MAX+32768;
 if(!type.toLowerCase().startsWith('multipart/form-data;')||!request.body)throw assignmentError('invalid_upload','Choose a file to upload.');
 if(Number(request.headers.get('content-length'))>limit)throw assignmentError('file_too_large','Use direct private Storage upload for larger files.',413);
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw assignmentError('file_too_large','Use direct private Storage upload for larger files.',413);}chunks.push(part.value);}}finally{reader.releaseLock();}
 let form;try{form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':type}}).formData();}catch{throw assignmentError('invalid_upload','The file could not be read. Try again.');}
 const allowed=['file','clientId','title','description','operation','share'];
 if([...form.keys()].some(key=>!allowed.includes(key))||allowed.some(key=>form.getAll(key).length>1))throw assignmentError('invalid_upload','Upload one file at a time.');
 const file=form.get('file');if(!file||typeof file==='string')throw assignmentError('invalid_upload','Choose a file to upload.');
 const content=Buffer.from(await file.arrayBuffer()),metadata=validateDocumentFile(file.name,content),share=form.get('share');
 if(!['true','false'].includes(share))throw assignmentError('invalid_upload','Choose whether to share this file.');
 return {action:'upload',clientId:clientId(form.get('clientId')),operation:assignmentId(form.get('operation')),title:assignmentText(!form.get('title')||form.get('title')===file.name?metadata.filename:form.get('title'),180),description:documentDescription(form.get('description')||''),share:share==='true',...metadata,content};
}
export function documentFileCommand(body){
 const common=['action','clientId','operation','id','revision'],extra=body?.action==='update'?['title','description','share']:[];
 if(!body||Object.keys(body).some(key=>![...common,...extra].includes(key))||!['update','publish','revoke','archive'].includes(body.action))throw assignmentError('invalid_action','Choose a valid document action.');
 if(typeof body.revision!=='string'||!/^[1-9][0-9]{0,14}$/.test(body.revision))throw assignmentError('invalid_revision','Refresh this document before changing it.');
 const result={action:body.action,clientId:clientId(body.clientId),operation:assignmentId(body.operation),id:assignmentId(body.id),revision:body.revision};
 if(body.action==='update'){if(typeof body.share!=='boolean')throw assignmentError('invalid_action','Choose document visibility.');Object.assign(result,{title:assignmentText(body.title,180),description:documentDescription(body.description||''),share:body.share});}
 return result;
}
