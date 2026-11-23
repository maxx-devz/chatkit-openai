import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDocumentFile,readDocumentFile,documentFileCommand,DOCUMENT_UPLOAD_MAX} from '../lib/client-document-file-policy.js';
const id='12345678-1234-4234-8234-123456789012';
function request(filename,content,extras={}){const body=new FormData();body.set('clientId','1');body.set('operation',id);body.set('share','false');body.set('file',new File([content],filename,{type:'text/html'}));for(const [key,value] of Object.entries(extras))body.set(key,value);return new Request('https://portal.example/api/admin/client-document-files',{method:'POST',body});}
test('file content and server-selected MIME are independent of browser MIME; defaults avoid extra typing',async()=>{
 const result=await readDocumentFile(request('Audit.pdf','%PDF-1.7\nSynthetic PDF fixture'));
 assert.equal(result.title,'Audit.pdf');assert.equal(result.mimeType,'application/pdf');assert.equal(result.sizeBytes,result.content.length);assert.equal(result.share,false);
 assert.equal((await readDocumentFile(request('Notes.txt','Approved note',{share:'true'}))).share,true);
});
test('file policy blocks traversal, executable/HTML/SVG, signature mismatch, empty and oversized bytes',()=>{
 for(const name of ['../file.pdf','folder\\file.pdf','report\r\nX.pdf','.hidden.pdf','test.exe','page.html','image.svg'])assert.throws(()=>validateDocumentFile(name,Buffer.from('%PDF-1.7')));
 for(const name of ['file.pdf','file.png','file.jpg','file.webp','file.docx','file.xlsx','file.pptx'])assert.throws(()=>validateDocumentFile(name,Buffer.from('wrong content')));
 assert.throws(()=>validateDocumentFile('file.txt',Buffer.alloc(0)));assert.throws(()=>validateDocumentFile('file.txt',Buffer.alloc(DOCUMENT_UPLOAD_MAX+1)));
 assert.throws(()=>validateDocumentFile('file.txt',Buffer.from([255,254,0])));
 assert.throws(()=>validateDocumentFile('file.docx',Buffer.from('PK\x03\x04[Content_Types].xml word/document.xml vbaProject.bin')));
});
test('multipart reader enforces one file, known fields and bounded streamed bodies',async()=>{
 await assert.rejects(readDocumentFile(request('note.txt','hello',{ownerId:'2'})));
 const body=new FormData();body.append('file',new File(['one'],'one.txt'));body.append('file',new File(['two'],'two.txt'));await assert.rejects(readDocumentFile(new Request('https://portal.example',{method:'POST',body})));
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(DOCUMENT_UPLOAD_MAX+32769));controller.close();}});
 await assert.rejects(readDocumentFile(new Request('https://portal.example',{method:'POST',body:stream,duplex:'half',headers:{'Content-Type':'multipart/form-data; boundary=test'}})));
});
test('file updates reject owner, client transfer, forged privilege and invalid revisions',()=>{
 const base={action:'publish',clientId:'1',id,revision:'1',operation:id};assert.equal(documentFileCommand(base).action,'publish');
 for(const extra of [{ownerId:'2'},{publishedBy:'2'},{content:'bad'},{revision:'0'},{action:'delete_everything'},{clientId:'1 OR TRUE'}])assert.throws(()=>documentFileCommand({...base,...extra}));
 assert.throws(()=>documentFileCommand({...base,action:'update',title:'Title',description:'Note',share:'true'}));
});
