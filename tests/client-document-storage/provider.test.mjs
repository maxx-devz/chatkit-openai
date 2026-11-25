import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {privateStorageConfig,signedDocumentUpload,inspectStoredDocument,signedDocumentDownload,openStoredDocumentPreview,removeStoredDocument,copyStoredDocument} from '../../lib/client-document-storage-provider.js';
const origin='https://fictionalfixture.supabase.co',bucket='private-fixture',path='clients/1/1234/document.js';
const old=globalThis.fetch;
process.env.CLIENT_DOCUMENTS_SUPABASE_URL=origin;process.env.CLIENT_DOCUMENTS_STORAGE_BUCKET=bucket;process.env.CLIENT_DOCUMENTS_SUPABASE_SERVICE_KEY='sb_secret_fixture_only';
test.after(()=>{globalThis.fetch=old;});
test('server keys stay in provider headers; one-object upload grants bind the private bucket and path',async()=>{
 const calls=[];globalThis.fetch=async(url,opts)=>{calls.push([url,opts]);return Response.json(url.includes('/bucket/')?{public:false}:{url:'/object/upload/sign/'+bucket+'/'+path+'?token=fixture-object-token'});};
 const upload=await signedDocumentUpload(path);assert.equal(upload.bucket,bucket);assert.doesNotMatch(JSON.stringify(upload),/sb_secret/);assert.equal(calls[0][1].headers.apikey,'sb_secret_fixture_only');assert.equal(upload.endpoint,'https://fictionalfixture.storage.supabase.co/storage/v1/upload/resumable/sign');
 globalThis.fetch=async()=>Response.json({public:true});await assert.rejects(signedDocumentUpload(path),/private Storage bucket/);
 globalThis.fetch=async url=>Response.json(url.includes('/bucket/')?{public:false}:{url:'https://foreign.example/object?token=bad'});await assert.rejects(signedDocumentUpload(path),/scoped address/);
});
test('full streamed validation hashes files larger than 2MB with bounded chunks',async()=>{
 const bytes=Buffer.from('// Inert source fixture\n'+'x'.repeat(3*1024*1024)),info={id:'one',size:bytes.length,updated_at:'same'};let offset=0;
 globalThis.fetch=async url=>url.includes('/bucket/')?Response.json({public:false}):url.includes('/info/')?Response.json(info):new Response(new ReadableStream({pull(c){if(offset>=bytes.length)return c.close();const end=Math.min(offset+65536,bytes.length);c.enqueue(bytes.subarray(offset,end));offset=end;}}));
 const result=await inspectStoredDocument(path,'source.js',bytes.length);assert.equal(result.mimeType,'text/plain');assert.equal(result.inline,false);assert.equal(result.contentHash,createHash('sha256').update(bytes).digest('hex'));
 await assert.rejects(inspectStoredDocument(path,'source.js',1),/size does not match/);
});
test('mismatched content, changed versions and provider failures never validate a file',async()=>{
 const bytes=Buffer.from('MZ binary'),info={id:'one',size:bytes.length,version:1};
 globalThis.fetch=async url=>url.includes('/bucket/')?Response.json({public:false}):url.includes('/info/')?Response.json(info):new Response(bytes);
 await assert.rejects(inspectStoredDocument(path,'image.pdf',bytes.length));
 let n=0;globalThis.fetch=async url=>url.includes('/bucket/')?Response.json({public:false}):url.includes('/info/')?Response.json({...info,version:++n}):new Response('valid txt');
 await assert.rejects(inspectStoredDocument(path,'file.txt',9),/changed while being checked/);
 globalThis.fetch=async()=>new Response(null,{status:403});await assert.rejects(signedDocumentUpload(path),/could not complete/);
});
test('download grants expire in 30 seconds and force inert attachments',async()=>{
 let body;globalThis.fetch=async(url,opts)=>{if(url.includes('/bucket/'))return Response.json({public:false});body=JSON.parse(opts.body);return Response.json({signedURL:'/object/sign/'+bucket+'/'+path+'?token=short-fixture'});};
 const url=new URL(await signedDocumentDownload(path,'code.html'));assert.deepEqual(body,{expiresIn:30});assert.equal(url.searchParams.get('download'),'code.html');
 const previous=process.env.CLIENT_DOCUMENTS_SUPABASE_SERVICE_KEY;process.env.CLIENT_DOCUMENTS_SUPABASE_SERVICE_KEY='sb_publishable_fixture';assert.throws(privateStorageConfig);process.env.CLIENT_DOCUMENTS_SUPABASE_SERVICE_KEY=previous;
});


test('a pending object already stored is revalidated without requesting an overwrite grant',async()=>{
 const calls=[];globalThis.fetch=async(url,opts)=>{calls.push([url,opts]);if(url.includes('/bucket/'))return Response.json({public:false});if(url.includes('/info/'))return Response.json({size:159958});throw Error('Must not request another upload token');};
 assert.deepEqual(await signedDocumentUpload(path,159958),{stored:true});assert.equal(calls.some(([url])=>url.includes('/upload/sign/')),false);
 await assert.rejects(signedDocumentUpload(path,1),/different size/);
});

test('a missing object still gets a new grant, and a racing completed upload can resume safely',async()=>{
 let infos=0;globalThis.fetch=async url=>{if(url.includes('/bucket/'))return Response.json({public:false});if(url.includes('/info/'))return ++infos===1?Response.json({statusCode:'404',code:'NoSuchKey'},{status:400}):Response.json({size:24});return Response.json({code:'Duplicate'},{status:409});};
 assert.deepEqual(await signedDocumentUpload(path,24),{stored:true});assert.equal(infos,2);
 globalThis.fetch=async url=>url.includes('/bucket/')?Response.json({public:false}):url.includes('/info/')?Response.json({code:'NoSuchKey',statusCode:'404'},{status:400}):Response.json({url:'/object/upload/sign/'+bucket+'/'+path+'?token=fixture'});
 assert.ok((await signedDocumentUpload(path,24)).signedUrl);
 globalThis.fetch=async url=>url.includes('/bucket/')?Response.json({public:false}):Response.json({code:'AccessDenied'},{status:403});await assert.rejects(signedDocumentUpload(path,24),/could not complete/);
});

test('private preview streams bytes and bounded PDF ranges without disclosing provider credentials',async()=>{
 const bytes=Buffer.from('%PDF-1.4 synthetic preview'),calls=[];
 globalThis.fetch=async(url,options)=>{calls.push([url,options]);if(url.includes('/bucket/'))return Response.json({public:false});if(options.headers.Range)return new Response(bytes.subarray(0,4),{status:206,headers:{'Content-Range':'bytes 0-3/'+bytes.length,'Content-Length':'4'}});return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});};
 let response=await openStoredDocumentPreview(path,null,bytes.length);assert.equal(await response.text(),bytes.toString());
 response=await openStoredDocumentPreview(path,'bytes=0-3',bytes.length);assert.equal(response.status,206);assert.equal(await response.text(),'%PDF');assert.equal(calls.at(-1)[1].headers.Range,'bytes=0-3');
 await assert.rejects(openStoredDocumentPreview(path,'bytes=999-',bytes.length),/valid preview range/);
 globalThis.fetch=async url=>url.includes('/bucket/')?Response.json({public:false}):new Response('bad',{status:206,headers:{'Content-Range':'bytes 0-2/999'}});
 await assert.rejects(openStoredDocumentPreview(path,'bytes=0-3',bytes.length),/could not be verified/);
});

test('Storage removal uses its object API, verifies absence and remains safe to repeat',async()=>{
 let present=true,deletes=0;globalThis.fetch=async(url,options)=>{if(url.includes('/bucket/'))return Response.json({public:false});if(options.method==='DELETE'){assert.deepEqual(JSON.parse(options.body),{prefixes:[path]});present=false;deletes++;return Response.json([]);}return present?Response.json({size:12}):Response.json({code:'NoSuchKey',statusCode:'404'},{status:400});};
 await removeStoredDocument(path);await removeStoredDocument(path);assert.equal(deletes,2);
 globalThis.fetch=async(url,options)=>url.includes('/bucket/')?Response.json({public:false}):options.method==='DELETE'?Response.json([]):Response.json({size:12});await assert.rejects(removeStoredDocument(path),/not confirmed/);
});
test('copying an object never overwrites an existing destination and keeps keys server-only',async()=>{
 let exists=false,copies=0;globalThis.fetch=async(url,options)=>{if(url.includes('/bucket/'))return Response.json({public:false});if(url.endsWith('/object/copy')){copies++;assert.deepEqual(JSON.parse(options.body),{bucketId:bucket,sourceKey:path,destinationKey:'clients/1/1234/Human file.js'});exists=true;return Response.json({Key:'fixture'});}return exists?Response.json({size:12}):new Response(null,{status:404});};await copyStoredDocument(path,'clients/1/1234/Human file.js');await copyStoredDocument(path,'clients/1/1234/Human file.js');assert.equal(copies,1);
});
