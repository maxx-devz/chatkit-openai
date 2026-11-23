import {test} from 'node:test';
import assert from 'node:assert/strict';
import {uploadFileProblem,uploadQueueCounts,DOCUMENT_UPLOAD_BATCH_MAX} from '../lib/client-document-upload-queue.js';
test('bulk upload metadata rejects unsupported, empty, oversized or unsafe files before requests',()=>{
 assert.equal(DOCUMENT_UPLOAD_BATCH_MAX,20);assert.equal(uploadFileProblem({name:'Audit.PDF',size:20}), '');
 for(const file of [{name:'bad.exe',size:2},{name:'empty.pdf',size:0},{name:'big.pdf',size:2*1024*1024+1},{name:'../private.pdf',size:2},{name:'folder\\report.pdf',size:2}])assert.ok(uploadFileProblem(file));
});
test('bulk results distinguish saved documents from failures and unstarted files',()=>{
 assert.deepEqual(uploadQueueCounts([{status:'saved'},{status:'invalid'},{status:'unknown'},{status:'ready'},{status:'uploading'}]),{saved:1,failed:2,ready:1,processed:3,total:5});
});
