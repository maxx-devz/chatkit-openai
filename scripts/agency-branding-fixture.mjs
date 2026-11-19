import sharp from "sharp";
import { randomUUID } from "node:crypto";
export async function seedBrandingFixture(db,f) {
  const identity=(await db.query("SELECT current_database() name,host(inet_server_addr()) host")).rows[0];
  if(identity.host!=="127.0.0.1"||!/^aoc_stage04_rehearsal_[a-f0-9]+$/.test(identity.name))throw Error("Synthetic loopback fixture required.");
  f.brands=[];
  for(const [i,name,color] of [[0,"Harbor Studio","#164e63"],[1,"Summit Collective","#5b2168"]]){
    const a=f.accounts[i?"ownerB":"ownerA"],agency=f.agencies[i];
    const base=await sharp({create:{width:112,height:80,channels:4,background:color}}).png().toBuffer();
    const shape=await sharp({create:{width:i?24:70,height:i?58:12,channels:4,background:"#ffffff"}}).png().toBuffer();
    const logo=await sharp(base).composite([{input:shape,gravity:"centre"}]).png().toBuffer();
    const settings={portalName:name,reportName:name+" delivery report",legalName:name+" Fictional Company",supportName:name+" support",supportEmail:i?"help@summit.example.invalid":"help@harbor.example.invalid",palette:{primary:color,onPrimary:"#ffffff",background:"#f8fafc",text:"#172033"},poweredBy:true};
    await db.query("SELECT agency_platform.brand_save($1,$2,$3,$4::jsonb,$5)",[a.accountIdentifier,a.session,agency.id,JSON.stringify({settings,revision:"0",operation:randomUUID(),reason:"Synthetic brand review",logoAction:"replace"}),logo]);
    f.brands.push({...settings,slug:agency.slug,agencyId:agency.id,logo:logo.toString("base64")});
  }
  return f;
}
