import {documentFileFormat} from './client-document-formats.js';

export const DOCUMENT_UPLOAD_BATCH_MAX=20;
export function uploadFileProblem(file){
 if(!file?.size)return 'This file is empty.';
 try{documentFileFormat(file.name);}catch(error){return error.message;}
 return '';
}
export function uploadQueueCounts(entries){
 const saved=entries.filter(row=>row.status==='saved').length;
 const failed=entries.filter(row=>['failed','unknown','invalid'].includes(row.status)).length;
 return {saved,failed,ready:entries.filter(row=>row.status==='ready').length,processed:saved+failed,total:entries.length};
}
