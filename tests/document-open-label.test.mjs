import test from 'node:test';
import assert from 'node:assert/strict';
import {documentOpenLabel} from '../lib/document-open-label.js';

test('Google editor URLs identify Docs, Sheets and Slides without exposing or following the source link',()=>{
 for(const [app,label] of [['document','Open in Google Docs'],['spreadsheets','Open in Google Sheets'],['presentation','Open in Google Slides']])assert.equal(documentOpenLabel({delivery:'link',sourceUrl:`https://docs.google.com/${app}/d/ApprovedFixture12345/edit`,filename:'Client file'}),label);
 for(const sourceUrl of ['https://docs.google.com.evil.test/spreadsheets/d/ApprovedFixture12345/edit','https://evil.test/document/d/ApprovedFixture12345/edit','javascript:alert(1)','https://user@docs.google.com/document/d/ApprovedFixture12345/edit','https://drive.google.com/file/d/ApprovedFixture12345/view','not a URL'])assert.equal(documentOpenLabel({delivery:'link',sourceUrl,filename:'Unknown file'}),'Open file');
});

test('supported filename extensions choose truthful file-specific actions with a generic unknown fallback',()=>{
 for(const [filename,label] of [['Audit.PDF','View PDF'],['Budget.xlsx','Open spreadsheet'],['Budget.xls','Open spreadsheet'],['Export.csv','Open spreadsheet'],['Scope.docx','Open Word document'],['Launch.pptx','Open presentation'],['Photo.JPG','View image'],['Readme.txt','View text file'],['Unidentified file','Open file'],['My .pdf notes','Open file'],['script.exe','Open file']])assert.equal(documentOpenLabel({delivery:'link',filename}),label);
 assert.equal(documentOpenLabel(),'Open file');
});

test('saved MIME type takes precedence and protected Google exports open as PDF',()=>{
 assert.equal(documentOpenLabel({delivery:'protected',mimeType:'application/pdf',filename:'Approved file'}),'View PDF');
 assert.equal(documentOpenLabel({mimeType:'image/png',filename:'Misleading.pdf'}),'View image');
 assert.equal(documentOpenLabel({mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',filename:'File'}),'Open spreadsheet');
 for(const type of ['document','spreadsheet','presentation'])assert.equal(documentOpenLabel({delivery:'protected',mimeType:'application/vnd.google-apps.'+type,filename:'Approved file'}),'View PDF');
 assert.equal(documentOpenLabel({delivery:'link',mimeType:'application/vnd.google-apps.spreadsheet'}),'Open in Google Sheets');
});
