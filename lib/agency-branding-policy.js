// Presentation selectors never confer membership or authorize a resource.
export const DEFAULT_PALETTE = { primary: "#164e63", onPrimary: "#ffffff", background: "#f8fafc", text: "#172033" };
export const BRAND_SCREENS = ["login", "clients", "staff", "sources", "usage", "audit", "settings", "branding", "specialists", "security", "mfa", "recovery", "reset", "verify", "invitation"];
export function brandPath(slug, screen = "clients") {
  if (!/^[a-z0-9][a-z0-9_-]{1,79}$/.test(slug || "") || !BRAND_SCREENS.includes(screen)) throw Error("Invalid branded destination.");
  return "/portal/" + slug + "/" + screen;
}
export function contrast(a, b) {
  const lum = hex => { if (!/^#[a-f0-9]{6}$/i.test(hex || "")) return NaN; const c = hex.slice(1).match(/../g).map(x => parseInt(x,16)/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4); return c[0]*.2126+c[1]*.7152+c[2]*.0722; };
  const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05);
}
export function validPalette(value) {
  return value && Object.keys(value).sort().join() === "background,onPrimary,primary,text"
    && Object.values(value).every(x => typeof x === "string" && /^#[a-f0-9]{6}$/i.test(x))
    && contrast(value.primary,value.onPrimary)>=4.5 && contrast(value.background,value.text)>=4.5;
}
export function validateBrand(value) {
  const fields = ["portalName","reportName","legalName","supportName","supportEmail","palette","poweredBy"];
  if (!value || Object.keys(value).some(k=>!fields.includes(k)) || fields.some(k=>!(k in value))) throw Error("Use only the supported brand fields.");
  const out={...value};
  for (const [key,max,required] of [["portalName",80,true],["reportName",100,true],["legalName",120,false],["supportName",120,false],["supportEmail",200,false]]) {
    if(typeof out[key]!=="string" || out[key].trim().length>max || required&&!out[key].trim() || /[<>\x00-\x1f\x7f]/.test(out[key]))throw Error("Check the brand text fields.");out[key]=out[key].trim();
  }
  if(out.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.supportEmail))throw Error("Use a valid support email.");
  if(!validPalette(out.palette))throw Error("Use hex colors with at least 4.5:1 text contrast.");
  if(typeof out.poweredBy!=="boolean")throw Error("Choose the attribution setting.");
  return out;
}
export function reportIdentity(brand) {
  if(!brand)return null;
  return {portalName:brand.portalName,reportName:brand.reportName,legalName:brand.legalName,supportName:brand.supportName,supportEmail:brand.supportEmail,logoUrl:brand.logoUrl||null,poweredBy:brand.poweredBy,softwareOwner:"Always Open Commerce",agencySlug:brand.slug,revision:brand.revision};
}
export function identityCsv(identity, rows) {
  const cell=value=>'"'+String(value??"").replace(/^[\s]*[=+@-]/,x=>"'"+x).replaceAll('"','""')+'"';
  const head=identity?[["Report",identity.reportName],["Portal",identity.portalName],["Legal company",identity.legalName],["Support",identity.supportName,identity.supportEmail],["Software owner",identity.softwareOwner]]:[];
  return [...head,...rows].map(row=>row.map(cell).join(",")).join("\r\n");
}
