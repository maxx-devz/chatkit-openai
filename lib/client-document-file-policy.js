import {assignmentError,assignmentId,assignmentText,clientId,documentDescription} from './client-document-assignment-policy.js';
export const DOCUMENT_UPLOAD_MAX=2*1024*1024;
export const DOCUMENT_UPLOAD_ACCEPT='.pdf,.docx,.xlsx,.pptx,.txt,.csv,.md,.png,.jpg,.jpeg,.webp';
const types={pdf:'application/pdf',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',txt:'text/plain',csv:'text/csv',md:'text/plain',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp'};
export function validateDocumentFile(filename,content){
 if(typeof filename!=='string'||!filename.trim()||filename.length>180||/[<>:"/\\\x00-\x1f\x7f]/.test(filename)||filename.startsWith('.'))throw assignmentError('invalid_filename','Use a normal filename without folders or special characters.');
 if(!Buffer.isBuffer(content)||!content.length)throw assignmentError('invalid_file','Choose a non-empty file.');
 if(content.length>DOCUMENT_UPLOAD_MAX)throw assignmentError('file_too_large','Each file must be 2 MB or smaller.',413);
 const ext=filename.split('.').pop().toLowerCase(),mime=types[ext];if(!mime)throw assignmentError('file_type','Use PDF, DOCX, XLSX, PPTX, TXT, CSV, Markdown, PNG, JPEG or WebP.',415);
 let valid=true;
 if(ext==='pdf')valid=content.subarray(0,5).toString()==='%PDF-';
 if(ext==='png')valid=content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]));
 if(['jpg','jpeg'].includes(ext))valid=content.subarray(0,3).equals(Buffer.from([255,216,255]));
 if(ext==='webp')valid=content.subarray(0,4).toString()==='RIFF'&&content.subarray(8,12).toString()==='WEBP';
 if(['docx','xlsx','pptx'].includes(ext)){
  const marker={docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml'}[ext];
  // Bounded signature/container checks only: never extract or execute archive contents.
  valid=content.subarray(0,4).equals(Buffer.from([80,75,3,4]))&&content.includes(Buffer.from('[Content_Types].xml'))&&content.includes(Buffer.from(marker))&&!content.includes(Buffer.from('vbaProject.bin'));
 }
 if(['txt','csv','md'].includes(ext)){try{new TextDecoder('utf-8',{fatal:true}).decode(content);valid=!content.includes(0);}catch{valid=false;}}
 if(!valid)throw assignmentError('file_mismatch','The file content does not match its extension. Export a new copy and try again.',415);
 return {filename,mimeType:mime,sizeBytes:content.length,inline:['pdf','png','jpg','jpeg','webp'].includes(ext)};
}
export async function readDocumentFile(request){
 const type=request.headers.get('content-type')||'',limit=DOCUMENT_UPLOAD_MAX+32768;
 if(!type.toLowerCase().startsWith('multipart/form-data;')||!request.body)throw assignmentError('invalid_upload','Choose a file to upload.');
 if(Number(request.headers.get('content-length'))>limit)throw assignmentError('file_too_large','Each file must be 2 MB or smaller.',413);
 const reader=request.body.getReader(),chunks=[];let size=0;
 try{for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>limit){await reader.cancel();throw assignmentError('file_too_large','Each file must be 2 MB or smaller.',413);}chunks.push(part.value);}}finally{reader.releaseLock();}
 let form;try{form=await new Response(Buffer.concat(chunks),{headers:{'Content-Type':type}}).formData();}catch{throw assignmentError('invalid_upload','The file could not be read. Try again.');}
 const allowed=['file','clientId','title','description','operation','share'];
 if([...form.keys()].some(key=>!allowed.includes(key))||allowed.some(key=>form.getAll(key).length>1))throw assignmentError('invalid_upload','Upload one file at a time.');
 const file=form.get('file');if(!file||typeof file==='string')throw assignmentError('invalid_upload','Choose a file to upload.');
 const content=Buffer.from(await file.arrayBuffer()),metadata=validateDocumentFile(file.name,content),share=form.get('share');
 if(!['true','false'].includes(share))throw assignmentError('invalid_upload','Choose whether to share this file.');
 return {action:'upload',clientId:clientId(form.get('clientId')),operation:assignmentId(form.get('operation')),title:assignmentText(form.get('title')||file.name,180),description:documentDescription(form.get('description')||''),share:share==='true',...metadata,content};
}
export function documentFileCommand(body){
 const common=['action','clientId','operation','id','revision'],extra=body?.action==='update'?['title','description','share']:[];
 if(!body||Object.keys(body).some(key=>![...common,...extra].includes(key))||!['update','publish','revoke','archive'].includes(body.action))throw assignmentError('invalid_action','Choose a valid document action.');
 if(typeof body.revision!=='string'||!/^[1-9][0-9]{0,14}$/.test(body.revision))throw assignmentError('invalid_revision','Refresh this document before changing it.');
 const result={action:body.action,clientId:clientId(body.clientId),operation:assignmentId(body.operation),id:assignmentId(body.id),revision:body.revision};
 if(body.action==='update'){if(typeof body.share!=='boolean')throw assignmentError('invalid_action','Choose document visibility.');Object.assign(result,{title:assignmentText(body.title,180),description:documentDescription(body.description||''),share:body.share});}
 return result;
}
