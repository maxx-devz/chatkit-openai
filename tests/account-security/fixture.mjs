import { readFile, readdir } from "node:fs/promises";
import { createOTP } from "@better-auth/utils/otp";
import { base32 } from "@better-auth/utils/base32";
export function mergeCookie(cookie, response) {
  const jar = new Map((cookie || "").split("; ").filter(Boolean).map(x => [x.slice(0,x.indexOf("=")),x.slice(x.indexOf("=")+1)]));
  for (const item of response.headers.getSetCookie()) { const pair=item.split(";")[0],i=pair.indexOf("="); if (/max-age=0/i.test(item) || !pair.slice(i+1)) jar.delete(pair.slice(0,i)); else jar.set(pair.slice(0,i),pair.slice(i+1)); }
  return [...jar].map(([k,v])=>k+"="+v).join("; ");
}
export async function mailFor(recipient, kind) {
  const dir=process.env.AUTH_TEST_MAIL_DIR, messages=[];
  for (const file of await readdir(dir)) { const m=JSON.parse(await readFile(dir+"/"+file,"utf8")); if(m.recipient===recipient && m.kind===kind) messages.push(m); }
  return messages.sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).at(-1);
}
export function otp(uri) { return createOTP(new TextDecoder().decode(base32.decode(new URL(uri).searchParams.get("secret")))).totp(); }
export async function login(auth,a,origin,{ factor=true }={}) {
  let response=await auth.api.signInUsername({body:{username:a.username,password:a.password},headers:new Headers({origin}),asResponse:true});
  if(!response.ok) throw Error("Synthetic sign-in failed: "+response.status);
  let cookie=mergeCookie("",response),data=await response.json();
  if(data.twoFactorRedirect && factor) {
    response=await auth.api.verifyTOTP({body:{code:await otp(a.totpURI)},headers:new Headers({origin,cookie}),asResponse:true});
    if(!response.ok) throw Error("Synthetic MFA failed: "+response.status);
    cookie=mergeCookie(cookie,response);
  }
  return {cookie,challenge:Boolean(data.twoFactorRedirect)};
}
export async function prepareAccountSecurity(db,auth,f,origin) {
  const accounts={...f.accounts,...f.specialists};
  for(const a of Object.values(accounts)) {
    const row=(await db.query('SELECT email,"emailVerified","twoFactorEnabled" FROM "user" WHERE id=$1',[a.accountIdentifier])).rows[0]; a.email=row.email;
    if(!row.emailVerified) {
      await auth.api.sendVerificationEmail({body:{email:a.email,callbackURL:origin+"/account/verify"}});
      const m=await mailFor(a.email,"verify"),token=new URLSearchParams(new URL(m.link).hash.slice(1)).get("token");
      await auth.api.verifyEmail({query:{token}});
    }
    const signed=await login(auth,a,origin);a.cookie=signed.cookie;
    const session=await auth.api.getSession({headers:new Headers({cookie:a.cookie})});a.session=session.session.id;
    const state=(await db.query('SELECT agency_platform.account_status($1,$2) data',[a.accountIdentifier,a.session])).rows[0].data;
    if(state.required && !row.twoFactorEnabled) {
      const response=await auth.api.enableTwoFactor({body:{password:a.password},headers:new Headers({origin,cookie:a.cookie}),asResponse:true});
      if(!response.ok) throw Error("Synthetic enrollment failed: "+response.status);
      const setup=await response.json();a.totpURI=setup.totpURI;a.backupCodes=setup.backupCodes;
      const verified=await auth.api.verifyTOTP({body:{code:await otp(a.totpURI)},headers:new Headers({origin,cookie:a.cookie}),asResponse:true});
      if(!verified.ok) throw Error("Synthetic enrollment verification failed: "+verified.status);
      a.cookie=mergeCookie(a.cookie,verified);
      a.session=(await auth.api.getSession({headers:new Headers({cookie:a.cookie})})).session.id;
    }
  }
  return f;
}
