import test from 'node:test';
import assert from 'node:assert/strict';
import {createDocumentInspector,documentFileFormat} from '../lib/client-document-formats.js';
function check(name,...chunks){const inspector=createDocumentInspector(name);for(const chunk of chunks)inspector.push(Buffer.from(chunk));return inspector.finish();}
test('requested source, web and workspace shortcut files remain inert text',()=>{
 for(const ext of ['csv','docs','html','css','js','py','php','liquid','json','gdoc','gsheet','gslides']){const f=check('sample.'+ext,'hello world');assert.equal(f.inline,false);assert.match(f.mimeType,/text\//);}
 assert.equal(check('large.js','x'.repeat(3*1024*1024)).sizeBytes,3*1024*1024);
});
test('Office export signatures and markers work across stream chunk boundaries',()=>{
 for(const [ext,marker] of [['docx','word/document.xml'],['xlsx','xl/workbook.xml'],['pptx','ppt/presentation.xml']])assert.ok(check('file.'+ext,'PK\x03\x04[Content_Ty','pes].xml '+marker.slice(0,4),marker.slice(4)));
 assert.throws(()=>check('file.docx','PK\x03\x04[Content_Types].xml word/document.xml vbaPro','ject.bin'));
});
test('unknown types, traversal and disguised executables are rejected',()=>{
 for(const ext of ['exe','dll','msi','zip','bin','constructor','__proto__','docm'])assert.throws(()=>documentFileFormat('file.'+ext));
 for(const name of ['../file.js','folder\\file.js','.file.js','x\r\ny.js'])assert.throws(()=>documentFileFormat(name));
 for(const bytes of ['MZbinary',Buffer.from([127,69,76,70]),Buffer.from([207,250,237,254]),Buffer.from([0,3]),Buffer.from([255])])assert.throws(()=>check('file.js',bytes));
 assert.throws(()=>check('file.pdf','not a pdf'));assert.throws(()=>check('empty.txt',''));
});
test('UTF-8 decoding keeps partial characters between chunks and rejects truncated input',()=>{
 assert.equal(check('note.txt',Buffer.from([0xe2]),Buffer.from([0x82,0xac])).sizeBytes,3);assert.throws(()=>check('note.txt',Buffer.from([0xe2])));
});


test('JPEG and JPG headers are accepted, while a supported raster with the wrong suffix uses its real type',()=>{
 for(const name of ['photo.jpg','photo.jpeg','photo.JPEG']){const result=check(name,Buffer.from([255]),Buffer.from([216,255,224,0,16]));assert.equal(result.filename,name);assert.equal(result.mimeType,'image/jpeg');}
 const webp=check('flooding-cropped.jpeg','RI','FF\x10\x00\x00\x00WE','BPVP8 synthetic');assert.equal(webp.filename,'flooding-cropped.webp');assert.equal(webp.mimeType,'image/webp');
 const png=check('photo.jpeg',Buffer.from([137,80,78,71,13,10,26,10]));assert.equal(png.filename,'photo.png');assert.equal(png.mimeType,'image/png');
 assert.throws(()=>check('script.jpeg','<script>alert(1)</script>'));assert.throws(()=>check('program.jpeg','MZbinary'));assert.throws(()=>check('unknown.exe','RIFF\x10\x00\x00\x00WEBP'));
});
