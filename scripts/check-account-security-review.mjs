import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { request } from "@playwright/test";
import { otp } from "../tests/account-security/fixture.mjs";
const origin=process.env.BETTER_AUTH_URL,db=new URL(process.env.DATABASE_URL);
if(origin!=="http://127.0.0.1:3003"||db.hostname!=="127.0.0.1"||!/^\/aoc_stage04_rehearsal_[a-f0-9]+$/.test(db.pathname))throw Error("Synthetic local review only.");
const f=JSON.parse(await readFile('.tmp/auth-review/accounts.json','utf8'));
const context=await request.newContext({baseURL:origin,extraHTTPHeaders:{origin}});
try {
 const a=f.accounts.ownerA;
 const signed=await context.post('/api/auth/sign-in/username',{data:{username:a.username,password:a.password}});assert.equal(signed.status(),200);assert.equal((await signed.json()).twoFactorRedirect,true);
 assert.equal((await context.get('/api/admin/agency?agency=s13-harbor')).status(),401);
 const factor=await context.post('/api/auth/two-factor/verify-totp',{data:{code:await otp(a.totpURI)}});assert.equal(factor.status(),200);
 const access=await context.get('/api/admin/agency?agency=s13-harbor');assert.equal(access.status(),200);
 assert.equal((await context.get('/api/admin/agency?agency=s13-summit')).status(),403);
 assert.equal((await context.get('/agency')).status(),404);
 assert.equal((await context.get('/account/security')).status(),200);
 console.log('Synthetic MFA login, own-agency access and external gate verified.');
} finally { await context.dispose(); }
