import {DOCUMENT_UPLOAD_MAX,DOCUMENT_UPLOAD_ACCEPT} from './client-document-file-policy.js';

export const DOCUMENT_UPLOAD_BATCH_MAX=20;
export function uploadFileProblem(file){
 if(!file||typeof file.name!=='string'||!file.name.trim()||file.name.length>180||/[<>:"/\\\x00-\x1f\x7f]/.test(file.name)||file.name.startsWith('.'))return 'Use a normal filename without folders or special characters.';
 if(!file.size)return 'This file is empty.';
 if(file.size>DOCUMENT_UPLOAD_MAX)return 'Each file must be 2 MB or smaller.';
 const ext='.'+file.name.split('.').pop().toLowerCase();
 if(!DOCUMENT_UPLOAD_ACCEPT.split(',').includes(ext))return 'This file type is not supported. Use PDF, Office, text or an image.';
 return '';
}
export function uploadQueueCounts(entries){
 const saved=entries.filter(row=>row.status==='saved').length;
 const failed=entries.filter(row=>['failed','unknown','invalid'].includes(row.status)).length;
 return {saved,failed,ready:entries.filter(row=>row.status==='ready').length,processed:saved+failed,total:entries.length};
}
