import test from 'node:test';import assert from 'node:assert/strict';import sharp from 'sharp';
import {halfSizeImagePreview,readPreviewImage,wantsHalfImagePreview} from '../lib/document-image-preview.js';
test('image preview halves pixel dimensions, strips metadata and preserves original bytes',async()=>{
 const original=await sharp({create:{width:800,height:400,channels:4,background:{r:30,g:100,b:180,alpha:.7}}}).png().withExif({IFD0:{Artist:'Synthetic private fixture'}}).toBuffer(),copy=Buffer.from(original),preview=await halfSizeImagePreview(original),meta=await sharp(preview).metadata();
 assert.equal(meta.width,400);assert.equal(meta.height,200);assert.equal(meta.format,'webp');assert.equal(meta.exif,undefined);assert.equal(meta.hasAlpha,true);assert.deepEqual(original,copy);
});
test('oriented JPEG previews are readable, limited in size and do not upscale tiny images',async()=>{
 const input=await sharp({create:{width:400,height:200,channels:3,background:'#329'}}).jpeg().withMetadata({orientation:6}).toBuffer(),meta=await sharp(await halfSizeImagePreview(input)).metadata();assert.equal(meta.width,100);assert.equal(meta.height,200);
 const large=await sharp({create:{width:4000,height:2000,channels:3,background:'#329'}}).png().toBuffer(),small=await sharp(await halfSizeImagePreview(large)).metadata();assert.equal(small.width,1600);assert.equal(small.height,800);
 const tiny=await sharp({create:{width:1,height:1,channels:3,background:'#329'}}).png().toBuffer();assert.equal((await sharp(await halfSizeImagePreview(tiny)).metadata()).width,1);
});
test('small previews reject active content, malformed images and invalid modes',async()=>{
 for(const data of ['<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"></svg>','%PDF-1.4','not an image'])await assert.rejects(halfSizeImagePreview(Buffer.from(data)),/cannot be previewed/);
 assert.equal(wantsHalfImagePreview(new URLSearchParams('mode=view&preview=half'),'image/jpeg'),true);assert.equal(wantsHalfImagePreview(new URLSearchParams('mode=view'),'image/png'),false);
 for(const params of ['mode=download&preview=half','mode=view&preview=other'])assert.throws(()=>wantsHalfImagePreview(new URLSearchParams(params),'image/jpeg'));
 assert.throws(()=>wantsHalfImagePreview(new URLSearchParams('mode=view&preview=half'),'application/pdf'));
});
test('preview streaming bounds source memory and detects changed or truncated bytes',async()=>{
 assert.deepEqual(await readPreviewImage(new Response(Buffer.from('1234')),4),Buffer.from('1234'));await assert.rejects(readPreviewImage(new Response('12345'),4));await assert.rejects(readPreviewImage(new Response('123'),4));await assert.rejects(readPreviewImage(new Response('1'),33*1024*1024));
});
