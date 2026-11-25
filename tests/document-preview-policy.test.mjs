import test from 'node:test';
import assert from 'node:assert/strict';
import {documentPreviewKind,documentPreviewAddress,documentPreviewRange,documentInlineDisposition} from '../lib/document-preview-policy.js';
test('only safe raster images and PDFs can be previewed',()=>{
 for(const mime of ['image/jpeg','image/png','image/webp','image/gif'])assert.equal(documentPreviewKind(mime),'image');
 assert.equal(documentPreviewKind('application/pdf'),'pdf');
 for(const mime of ['image/svg+xml','text/html','text/javascript',null])assert.equal(documentPreviewKind(mime),null);
});
test('preview addresses stay on authorized same-origin document endpoints',()=>{
 const item={kind:'upload',mimeType:'image/jpeg',url:'/api/admin/client-document-storage/fixture?clientId=1&revision=2'};
 assert.equal(documentPreviewAddress(item),item.url+'&mode=view');assert.equal(documentPreviewAddress({...item,url:'/api/client-documents/file?clientId=1&source=storage&revision=2'}),'/api/client-documents/file?clientId=1&source=storage&revision=2&mode=view');
 for(const url of ['https://foreign.example/api/admin/client-document-storage/fixture','//foreign.example/file','/api/admin/other','javascript:alert(1)'])assert.equal(documentPreviewAddress({...item,url}),null);
 assert.equal(documentPreviewAddress({...item,kind:'file'}),null);
 assert.equal(documentPreviewAddress({...item,mimeType:'text/html'}),null);
});
test('PDF byte ranges normalize without allowing multiple or invalid ranges',()=>{
 assert.equal(documentPreviewRange(null,100),null);
 for(const [input,expected] of [['bytes=0-9','bytes=0-9'],['bytes=90-200','bytes=90-99'],['bytes=20-','bytes=20-99'],['bytes=-10','bytes=90-99'],['bytes=-200','bytes=0-99']])assert.equal(documentPreviewRange(input,100),expected);
 for(const input of ['bytes=100-','bytes=4-2','bytes=-0','bytes=-','bytes=0-2,4-6','bytes=9007199254740992-','garbage'])assert.throws(()=>documentPreviewRange(input,100));
});
test('inline filenames cannot inject response headers and retain UTF-8 names',()=>{
 const value=documentInlineDisposition('client "report"\r\n.pdf');assert.doesNotMatch(value,/[\r\n]/);assert.match(value,/^inline;/);
 assert.match(documentInlineDisposition('café.pdf'),/caf%C3%A9.pdf/);
});
