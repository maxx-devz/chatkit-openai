import { createRequire } from "node:module";
// Use the native Node entry for the installed sharp package (Next external).
export async function normalizeAgencyLogo(input) {
  const sharp = createRequire(process.cwd()+"/package.json")("sharp");
  if (!Buffer.isBuffer(input) || !input.length || input.length > 512000) throw Error("Use a PNG, JPEG or WebP logo up to 500 KB.");
  const image=sharp(input,{failOn:"error",limitInputPixels:1000000});
  const meta=await image.metadata();
  if(!["png","jpeg","webp"].includes(meta.format)||meta.pages>1||!meta.width||!meta.height||meta.width>1000||meta.height>1000)throw Error("Use a static raster logo of at most 1000 pixels per side.");
  const result=await image.rotate().resize(256,256,{fit:"inside",withoutEnlargement:true}).png().toBuffer();
  if(result.length>256000)throw Error("The prepared logo is too large.");
  return result;
}
