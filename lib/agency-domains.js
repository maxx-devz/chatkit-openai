import { domainToASCII } from "node:url";
export function normalizeAgencyDomain(input, canonical = process.env.BETTER_AUTH_URL) {
  if(typeof input!=="string" || input!==input.trim() || /[\s\/:@?#*\\%]/.test(input))throw Error("Enter a hostname without a scheme, port or path.");
  const host=domainToASCII(input).toLowerCase();
  if(!host || host.length>253 || host.endsWith(".") || !host.split(".").every(x=>/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(x))
    || host.split(".").length<2 || !/^[a-z]{2,63}$/.test(host.split(".").at(-1)) || /(?:^|\.)(?:localhost|local|invalid|vercel\.app)$/.test(host)
    || canonical && new URL(canonical).hostname.toLowerCase()===host)throw Error("Use a separate public hostname.");
  return host;
}
// Fixed Vercel origin; no tenant endpoint, redirect, DNS write or purchase API.
export function vercelDomainProvider({token,projectId,teamId,fetcher=fetch}) {
  if(!token || !/^prj_[a-zA-Z0-9]+$/.test(projectId||"") || teamId&&!/^team_[a-zA-Z0-9]+$/.test(teamId))throw Error("Vercel domain setup required.");
  async function call(path,method="GET",body) {
    const url=new URL(path,"https://api.vercel.com");if(teamId)url.searchParams.set("teamId",teamId);
    const response=await fetcher(url,{method,redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000),headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},...(body?{body:JSON.stringify(body)}:{})});
    if(!response.ok)throw Error("Domain provider check unavailable.");
    return response.json();
  }
  const project=encodeURIComponent(projectId);
  return {
    // Preparation for a separately approved hosting operation. No application
    // route invokes register/verify in Stage 15; tests use a synthetic transport.
    register:host=>call(`/v10/projects/${project}/domains`,"POST",{name:normalizeAgencyDomain(host)}),
    verify:host=>call(`/v9/projects/${project}/domains/${encodeURIComponent(normalizeAgencyDomain(host))}/verify`,"POST"),
    async inspect(value) {
      const host=normalizeAgencyDomain(value),domain=await call(`/v9/projects/${project}/domains/${encodeURIComponent(host)}`);
      if(domain.name!==host || domain.projectId!==projectId || domain.redirect || domain.gitBranch || domain.customEnvironmentId)throw Error("Domain provider ownership mismatch.");
      const cfg=await call(`/v6/domains/${encodeURIComponent(host)}/config?projectIdOrName=${project}`);
      const challenges=(domain.verification||[]).filter(x=>x.type==="TXT"&&typeof x.domain==="string"&&typeof x.value==="string"&&x.domain.length<254&&x.value.length<=500).map(x=>({type:"TXT",domain:x.domain,value:x.value}));
      return {verified:domain.verified===true && cfg.misconfigured===false,projectId,challenges};
    }
  };
}
