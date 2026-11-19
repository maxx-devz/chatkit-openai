import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {request} from "@playwright/test";
import {otp} from "../tests/account-security/fixture.mjs";
const origin=process.env.BETTER_AUTH_URL,db=new URL(process.env.DATABASE_URL);
if(origin!=="http://127.0.0.1:3004"||db.hostname!=="127.0.0.1"||!/^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(db.pathname))throw Error("Synthetic branding review required.");
const f=JSON.parse(await readFile('.tmp/branding-review/accounts.json','utf8'));
const ctx=await request.newContext({baseURL:origin,extraHTTPHeaders:{origin}});
try{
 for(const [i,key] of ["ownerA","ownerB"].entries()){
  await ctx.post("/api/auth/sign-out",{data:{}});const a=f.accounts[key],agency=f.agencies[i];
  const login=await ctx.post('/api/auth/sign-in/username',{data:{username:a.username,password:a.password}});assert.equal(login.status(),200);assert.equal((await login.json()).twoFactorRedirect,true);
  assert.equal((await ctx.post('/api/auth/two-factor/verify-totp',{data:{code:await otp(a.totpURI)}})).status(),200);
  const brand=await ctx.get('/api/admin/agency/brand?agency='+agency.slug);assert.equal(brand.status(),200);assert.equal((await brand.json()).brand.portalName,f.brands[i].portalName);
  const page=await ctx.get('/portal/'+agency.slug+'/login');assert.equal(page.status(),200);assert.ok((await page.text()).includes(f.brands[i].portalName));
  assert.equal((await ctx.get('/api/admin/agency/brand?agency='+f.agencies[1-i].slug)).status(),403);
 }
 assert.equal((await ctx.get('/agency')).status(),404);console.log('Both synthetic branded portals, MFA, own-scope API and closed external gate verified.');
}finally{await ctx.dispose();}
