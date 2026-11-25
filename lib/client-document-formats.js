// Explicit allowlist. Source files are data and are never executed or rendered.
const type=(mime,kind,inline=false)=>({mime,kind,inline});
export const DOCUMENT_FORMATS={
 pdf:type('application/pdf','pdf',true),docx:type('application/vnd.openxmlformats-officedocument.wordprocessingml.document','docx'),
 xlsx:type('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet','xlsx'),pptx:type('application/vnd.openxmlformats-officedocument.presentationml.presentation','pptx'),
 doc:type('application/msword','ole'),xls:type('application/vnd.ms-excel','ole'),ppt:type('application/vnd.ms-powerpoint','ole'),
 odt:type('application/vnd.oasis.opendocument.text','odf'),ods:type('application/vnd.oasis.opendocument.spreadsheet','odf'),odp:type('application/vnd.oasis.opendocument.presentation','odf'),
 rtf:type('application/rtf','rtf'),epub:type('application/epub+zip','epub'),
 png:type('image/png','png',true),jpg:type('image/jpeg','jpg',true),jpeg:type('image/jpeg','jpg',true),webp:type('image/webp','webp',true),gif:type('image/gif','gif',true),
 csv:type('text/csv','text'),tsv:type('text/tab-separated-values','text'),
};
for(const ext of ['txt','md','markdown','log','docs','gdoc','gsheet','gslides','gdraw','gform','html','htm','css','scss','sass','less','js','mjs','cjs','jsx','ts','tsx','json','jsonc','map','ipynb','py','php','liquid','sql','xml','svg','yaml','yml','toml','ini','cfg','conf','properties','java','c','cc','cpp','h','hpp','cs','go','rs','rb','swift','kt','kts','dart','vue','svelte','graphql','gql','lua','r','jl','tex'])DOCUMENT_FORMATS[ext]=type('text/plain','text');
export const DOCUMENT_UPLOAD_ACCEPT=Object.keys(DOCUMENT_FORMATS).map(ext=>'.'+ext).join(',');
export const DOCUMENT_FORMAT_HELP='Office/Google Workspace exports, PDF, images and programming/source files. Executables, installers and unknown formats are blocked.';
export function documentFileFormat(filename){
 if(typeof filename!=='string'||!filename.trim()||filename.length>180||/[<>:"/\\\x00-\x1f\x7f]/.test(filename)||filename.startsWith('.'))throw Error('Use a normal filename without folders or special characters.');
 const ext=filename.split('.').pop().toLowerCase(),format=DOCUMENT_FORMATS[ext];
 if(!Object.hasOwn(DOCUMENT_FORMATS,ext)||!format)throw Error('This extension is not supported. Executables, installers and unknown file types are blocked.');
 return {...format,extension:ext};
}
export function createDocumentInspector(filename){
 const format=documentFileFormat(filename),decoder=format.kind==='text'?new TextDecoder('utf-8',{fatal:true}):null;
 let prefix=new Uint8Array(),carry='',seen=0,officeMarker=false,contentTypes=false,macro=false,odf=false,epub=false;
 const marker={docx:'word/document.xml',xlsx:'xl/workbook.xml',pptx:'ppt/presentation.xml'}[format.kind];
 return {format,push(input){
  const bytes=input instanceof Uint8Array?input:new Uint8Array(input);seen+=bytes.length;
  if(prefix.length<512){const first=new Uint8Array(Math.min(512,prefix.length+bytes.length));first.set(prefix);first.set(bytes.subarray(0,first.length-prefix.length),prefix.length);prefix=first;}
  if(decoder){if(bytes.includes(0))throw Error('This source/text file contains binary data.');try{decoder.decode(bytes,{stream:true});}catch{throw Error('Source/text files must use valid UTF-8 text.');}}
  if(marker||format.kind==='odf'||format.kind==='epub'||format.kind==='ole'){
   for(let i=0;i<bytes.length;i+=65536){const text=carry+new TextDecoder('latin1').decode(bytes.subarray(i,i+65536));officeMarker ||= Boolean(marker&&text.includes(marker));contentTypes ||= text.includes('[Content_Types].xml');macro ||= /vbaproject\.bin|_vba_project/i.test(text);odf ||= text.includes('content.xml');epub ||= text.includes('META-INF/container.xml');carry=text.slice(-128);}
  }
 },finish(){
  if(!seen)throw Error('Choose a non-empty file.');
  const a=prefix,starts=bytes=>bytes.every((b,i)=>a[i]===b),ascii=value=>starts([...value].map(c=>c.charCodeAt(0)));
  if(ascii('MZ')||starts([127,69,76,70])||starts([207,250,237,254])||starts([254,237,250,207])||starts([206,250,237,254])||starts([254,237,250,206]))throw Error('Executable/binary programs are not accepted, even with a different extension.');
  if(decoder){try{decoder.decode();}catch{throw Error('Source/text files must use valid UTF-8 text.');}}
  const kind=format.kind;let valid=true,image=null;
  if(['jpg','png','gif','webp'].includes(kind)){
   if(starts([255,216,255]))image='jpg';
   else if(starts([137,80,78,71,13,10,26,10]))image='png';
   else if(ascii('GIF87a')||ascii('GIF89a'))image='gif';
   else if(ascii('RIFF')&&String.fromCharCode(...a.subarray(8,12))==='WEBP')image='webp';
   if(!image)throw Error('This file is not a supported JPEG, PNG, GIF or WebP image. Export a new image and try again.');
  }
  if(kind==='pdf')valid=ascii('%PDF-');
  if(kind==='png')valid=starts([137,80,78,71,13,10,26,10]);
  if(kind==='jpg')valid=starts([255,216,255]);
  if(kind==='webp')valid=ascii('RIFF')&&String.fromCharCode(...a.subarray(8,12))==='WEBP';
  if(kind==='gif')valid=ascii('GIF87a')||ascii('GIF89a');
  if(kind==='rtf')valid=ascii('{\\rtf');
  if(kind==='ole')valid=starts([208,207,17,224,161,177,26,225])&&seen>=512&&!macro;
  if(marker)valid=starts([80,75,3,4])&&officeMarker&&contentTypes&&!macro;
  if(kind==='odf')valid=starts([80,75,3,4])&&odf;
  if(kind==='epub')valid=starts([80,75,3,4])&&epub;
  if(!valid&&!image)throw Error('The file content does not match its extension. Export a new copy and try again.');
  const selected=image?DOCUMENT_FORMATS[image]:format,storedName=image&&image!==kind?filename.replace(/\.[^.]+$/,'').slice(0,179-image.length)+'.'+image:filename;
  return {filename:storedName,mimeType:selected.mime,sizeBytes:seen,inline:selected.inline};
 }};
}
