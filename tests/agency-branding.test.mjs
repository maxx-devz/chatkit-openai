import {test} from "node:test";
import assert from "node:assert/strict";
import {DEFAULT_PALETTE,contrast,validateBrand,brandPath,identityCsv} from "../lib/agency-branding-policy.js";
import {normalizeAgencyDomain,vercelDomainProvider} from "../lib/agency-domains.js";
import {mailBrandDestination} from "../lib/brand-callback.js";
import {normalizeAgencyLogo} from "../lib/agency-logo.js";
import sharp from "sharp";
test("branding contrast and unsafe presentation inputs reject",()=>{
 const b={portalName:"Fictional",reportName:"Report",legalName:"",supportName:"",supportEmail:"",palette:DEFAULT_PALETTE,poweredBy:true};
 assert.equal(validateBrand(b).portalName,"Fictional");assert.ok(contrast("#000000","#ffffff")>20);
 for(const bad of [{...b,palette:{...DEFAULT_PALETTE,onPrimary:DEFAULT_PALETTE.primary}},{...b,portalName:"<script>"},{...b,agencyId:"2"},{...b,supportEmail:"javascript:evil"}])assert.throws(()=>validateBrand(bad));
 assert.match(identityCsv({reportName:"=1+2"},[]),/"'=1\+2"/);
});
test("fixed brand destinations reject arbitrary return URLs and callbacks",()=>{
 assert.equal(brandPath("fictional-a","reset"),"/portal/fictional-a/reset");for(const x of ["https://foreign.invalid","//evil","../a"])assert.throws(()=>brandPath(x));
 const origin="http://127.0.0.1:3004",path=brandPath("fictional-a","reset");
 assert.equal(mailBrandDestination(origin+"/api/auth/reset-password/synthetic?callbackURL="+encodeURIComponent(origin+path),"reset",origin).slug,"fictional-a");
 for(const url of ["https://evil.example/return",origin+path+"?returnTo=https://evil.example",origin+"/platform",origin+"/portal/fictional-a/verify"])assert.equal(mailBrandDestination(origin+"/api/auth/reset-password/synthetic?callbackURL="+encodeURIComponent(url),"reset",origin),null);
});
test("raster sanitizer strips metadata and rejects executable, oversized and invalid input",async()=>{
 const png=await sharp({create:{width:20,height:20,channels:4,background:"white"}}).withMetadata().png().toBuffer();const clean=await normalizeAgencyLogo(png),meta=await sharp(clean).metadata();assert.equal(meta.format,"png");assert.equal(meta.exif,undefined);
 for(const bad of [Buffer.from('<svg onload="alert(1)"/>'),Buffer.from('<html>'),Buffer.alloc(512001),await sharp({create:{width:1001,height:1,channels:3,background:"red"}}).png().toBuffer()])await assert.rejects(normalizeAgencyLogo(bad));
});
test("domain normalization blocks URL injection, platform and private hosts",()=>{
 assert.equal(normalizeAgencyDomain("Portal.Example.com","https://platform.example"),"portal.example.com");
 for(const name of ["a.vercel.app","portal.invalid","127.0.0.1","localhost","portal.example.com:443","https://portal.example.com","*.example.com","a..com","a.com/","a.com.","platform.example"])assert.throws(()=>normalizeAgencyDomain(name,"https://platform.example"));
});
test("Vercel adapter binds fixed project/host, no redirects, no DNS writes, verifies ownership and configuration",async()=>{
 const calls=[],projectId="prj_synthetic",host="portal.example.com";
 const make=(over={})=>vercelDomainProvider({token:"synthetic-fixture",projectId,fetcher:async(url,options)=>{calls.push({url:String(url),method:options.method});assert.equal(url.origin,"https://api.vercel.com");assert.equal(options.redirect,"error");return Response.json(url.pathname.endsWith('/config')?{misconfigured:false}: {name:host,projectId,verified:true,verification:[],...over});}});
 assert.equal((await make().inspect(host)).verified,true);assert.equal(calls.length,2);assert.ok(calls.every(x=>x.method==="GET"));
 await assert.rejects(make({projectId:"prj_other"}).inspect(host));await assert.rejects(make({redirect:"evil.example"}).inspect(host));assert.equal((await make({verified:false}).inspect(host)).verified,false);
});
