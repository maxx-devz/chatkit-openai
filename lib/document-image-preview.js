import sharp from 'sharp';
import {assignmentError} from './client-document-assignment-policy.js';
const MAX_BYTES=32*1024*1024,MAX_PIXELS=40_000_000;
export function wantsHalfImagePreview(params,mime){
 const selected=params.get('preview');if(!selected)return false;
 if(selected!=='half'||params.get('mode')!=='view'||!['image/jpeg','image/png','image/webp','image/gif'].includes(mime))throw assignmentError('preview_unsupported','A smaller preview is available only for supported images.',415);
 return true;
}
export async function readPreviewImage(response,expected){
 const reader=response.body?.getReader();if(!reader)throw assignmentError('preview_unavailable','Image preview unavailable. Open the original file instead.',415);
 const parts=[];let size=0;try{if(!Number.isSafeInteger(expected)||expected<=0||expected>MAX_BYTES)throw Error();for(;;){const part=await reader.read();if(part.done)break;size+=part.value.byteLength;if(size>MAX_BYTES||size>expected)throw Error();parts.push(Buffer.from(part.value));}if(size!==expected)throw Error();return Buffer.concat(parts,size);}catch{await reader.cancel().catch(()=>{});throw assignmentError('preview_unavailable','This image cannot be previewed here. Open the original file instead.',415);}finally{reader.releaseLock();}
}
export async function halfSizeImagePreview(bytes){
 try{
  if(bytes.byteLength>MAX_BYTES)throw Error();
  const image=sharp(bytes,{limitInputPixels:MAX_PIXELS,animated:false,failOn:'warning'}).timeout({seconds:12}),metadata=await image.metadata();
  if(!['jpeg','png','webp','gif'].includes(metadata.format))throw Error();
  const width=metadata.autoOrient?.width||metadata.width,height=metadata.autoOrient?.height||metadata.height;
  if(!Number.isSafeInteger(width)||!Number.isSafeInteger(height)||width*height>MAX_PIXELS)throw Error();
  const halfWidth=Math.max(1,Math.floor(width/2)),halfHeight=Math.max(1,Math.floor(height/2)),scale=Math.min(1,1600/Math.max(halfWidth,halfHeight));
  const output=await image.autoOrient().resize({width:Math.max(1,Math.floor(halfWidth*scale)),height:Math.max(1,Math.floor(halfHeight*scale)),fit:'inside',withoutEnlargement:true}).webp({quality:76,effort:2}).toBuffer();
  return output;
 }catch{throw assignmentError('preview_unavailable','This image cannot be previewed here. Open the original file instead.',415);}
}
