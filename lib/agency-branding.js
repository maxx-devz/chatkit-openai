import "server-only";
import { databasePool } from "./database.js";
import { assertAgencyReview } from "./agency-administration.js";
import { consoleSession, consoleError, exactKeys, text } from "./platform-console.js";
import { brandPath, validateBrand, reportIdentity, identityCsv } from "./agency-branding-policy.js";
import { normalizeAgencyLogo } from "./agency-logo.js";
import { normalizeAgencyDomain, vercelDomainProvider } from "./agency-domains.js";

export async function publicBrand(slug) {
  assertAgencyReview();try{brandPath(slug);}catch{throw consoleError("brand_unavailable","This portal is unavailable.",404);}
  const data=(await databasePool.query("SELECT agency_platform.public_brand($1) data",[slug])).rows[0].data;
  if(!data)throw consoleError("brand_unavailable","This portal is unavailable.",404);
  return {...data,logoUrl:data.hasLogo?`/api/portal-brand/${slug}/logo?revision=${data.revision}`:null};
}
export async function agencyBrandContext(headers,slug) {
  const brand=await publicBrand(slug),context=await consoleSession(headers);
  const choices=(await databasePool.query("SELECT agency_platform.admin_choices($1,$2) data",[context.actor,context.session])).rows[0].data;
  if(!choices.some(a=>a.id===brand.agencyId))throw consoleError("agency_access_required","Agency access denied.");
  if(headers.has("x-aoc-agency-admin")&&headers.get("x-aoc-agency-admin")!==brand.agencyId)throw consoleError("workspace_changed","Reload this agency workspace.",409);
  return {...context,agency:{id:brand.agencyId,slug},brand};
}
export async function brandView(headers,slug) {
  const ctx=await agencyBrandContext(headers,slug);
  const data=(await databasePool.query("SELECT agency_platform.brand_view($1,$2,$3) data",[ctx.actor,ctx.session,ctx.agency.id])).rows[0].data;
  return {...data,brand:ctx.brand};
}
export async function saveBrand(headers,slug,body) {
  const ctx=await agencyBrandContext(headers,slug);
  exactKeys(body,["settings","revision","operation","reason","logoAction","logo"]);
  let settings;try{settings=validateBrand(body.settings);}catch{throw consoleError("invalid_brand","Check the brand fields and 4.5:1 contrast.",400);}
  const revision=text(body.revision,19),operation=text(body.operation,36),reason=text(body.reason,200),logoAction=body.logoAction;
  if(!/^\d+$/.test(revision)||!/^[a-f0-9-]{36}$/i.test(operation)||reason.length<3||!["keep","replace","remove"].includes(logoAction))throw consoleError("invalid_brand","Check the brand change.",400);
  let logo=null;
  if(logoAction==="replace") {
    if(typeof body.logo!=="string"||body.logo.length>684000||!/^[A-Za-z0-9+/]+={0,2}$/.test(body.logo))throw consoleError("invalid_logo","Use a supported raster logo.",400);
    try{logo=await normalizeAgencyLogo(Buffer.from(body.logo,"base64"));}catch{throw consoleError("invalid_logo","Use a valid static PNG, JPEG or WebP logo within the size limit.",400);}
  } else if(body.logo)throw consoleError("invalid_logo","Choose a logo action.",400);
  await databasePool.query("SELECT agency_platform.brand_save($1,$2,$3,$4::jsonb,$5)",[ctx.actor,ctx.session,ctx.agency.id,JSON.stringify({settings,revision,operation,reason,logoAction}),logo]);
  return {saved:true};
}
export async function requestBrandDomain(headers,slug,body) {
  const ctx=await agencyBrandContext(headers,slug);exactKeys(body,["hostname","operation","reason"]);
  let hostname;try{hostname=normalizeAgencyDomain(body.hostname);}catch{throw consoleError("invalid_domain","Use a separate public hostname without a path or port.",400);}
  const reason=text(body.reason,200),op=text(body.operation,36);
  if(!/^[a-f0-9-]{36}$/i.test(op)||reason.length<3)throw consoleError("invalid_domain","Provide a request identifier and reason.",400);
  await databasePool.query("SELECT agency_platform.domain_request($1,$2,$3,$4,$5,$6)",[ctx.actor,ctx.session,ctx.agency.id,hostname,op,reason]);
  return {requested:true,message:"Domain reserved for verification. Live hosting and DNS setup remain pending; this host is not enabled."};
}
export async function checkBrandDomain(headers,hostname,provider) {
  const ctx=await consoleSession(headers),host=normalizeAgencyDomain(hostname);
  const ticket=(await databasePool.query("SELECT agency_platform.domain_ticket($1,$2,$3) data",[ctx.actor,ctx.session,host])).rows[0].data;
  // Production transport is opt-in and read-only. Tests inject a fixture provider
  // here, never through a browser/request parameter.
  if(!provider) {
    if(process.env.AGENCY_DOMAIN_CHECKS_ENABLED!=="true")throw consoleError("domain_setup_required","Configure a separately approved hosting check.",503);
    provider=vercelDomainProvider({token:process.env.VERCEL_DOMAIN_TOKEN,projectId:process.env.VERCEL_DOMAIN_PROJECT_ID,teamId:process.env.VERCEL_DOMAIN_TEAM_ID});
  }
  const result=await provider.inspect(host);
  await databasePool.query("SELECT agency_platform.domain_checked($1,$2,$3,$4,$5,$6,$7,$8::jsonb)",[ctx.actor,ctx.session,host,ticket.agencyId,ticket.generation,result.verified===true,result.projectId,JSON.stringify(result.challenges)]);
  return {checked:true,verified:result.verified===true,routingEnabled:false};
}
export async function brandedAgencyExport(headers,slug,format) {
  const ctx=await agencyBrandContext(headers,slug);
  const data=(await databasePool.query("SELECT agency_platform.agency_admin_view($1,$2,$3,'') data",[ctx.actor,ctx.session,ctx.agency.id])).rows[0].data;
  const identity=reportIdentity(ctx.brand);
  if(format==="csv")return identityCsv(identity,[["Client","Portal enabled","AI enabled"],...data.clients.map(c=>[c.name,c.portalEnabled,c.aiEnabled])]);
  return {identity,clients:data.clients.map(c=>({id:c.id,name:c.name,portalEnabled:c.portalEnabled,aiEnabled:c.aiEnabled})),usage:data.usage};
}
// Client reports derive brand from the already authorized context, never from
// the public brand URL or a download request's supplied agency selector.
export async function clientReportIdentity(context) {
  if(!context.agency?.id)return null;
  const ready=(await databasePool.query("SELECT to_regprocedure('agency_platform.public_brand(text)') IS NOT NULL ready")).rows[0]?.ready;
  if(!ready)return null;
  const brand=(await databasePool.query("SELECT agency_platform.public_brand($1) data",[context.agency.slug])).rows[0].data;
  if(!brand || brand.agencyId!==String(context.agency.id))return null;
  return reportIdentity(brand);
}
