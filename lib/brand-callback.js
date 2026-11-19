import { brandPath } from "./agency-branding-policy.js";
// A callback is presentation-only and restricted to the configured auth origin
// and fixed account screens. Never forward arbitrary returnTo/redirect URLs.
export function mailBrandDestination(providerUrl,kind,origin=process.env.BETTER_AUTH_URL) {
 try {
  const url=new URL(providerUrl);if(url.origin!==new URL(origin).origin)return null;
  const raw=url.searchParams.get("callbackURL")||url.searchParams.get("redirectTo");if(!raw)return null;
  const destination=new URL(raw,origin);if(destination.origin!==new URL(origin).origin||destination.search||destination.hash)return null;
  const match=destination.pathname.match(/^\/portal\/([a-z0-9][a-z0-9_-]{1,79})\/(reset|verify)$/);
  return match&&match[2]===kind?{slug:match[1],path:brandPath(match[1],kind)}:null;
 }catch{return null;}
}
