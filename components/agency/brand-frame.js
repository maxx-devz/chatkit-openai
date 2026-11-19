import Image from "next/image";
import Link from "next/link";
import { brandPath } from "@/lib/agency-branding-policy";
import s from "./branding.module.css";
export default function BrandFrame({brand,children}) {
  const p=brand.palette;
  return <div className={s.frame} data-agency-brand={brand.slug} style={{"--brand-primary":p.primary,"--brand-on-primary":p.onPrimary,"--brand-bg":p.background,"--brand-text":p.text}}>
    <header className={s.masthead}><Link href={brandPath(brand.slug,"clients")} className={s.identity}>{brand.logoUrl?<Image unoptimized src={brand.logoUrl} width="64" height="64" alt={brand.portalName+" logo"}/>:<span className={s.monogram} aria-hidden="true">{brand.portalName.slice(0,2).toUpperCase()}</span>}<strong>{brand.portalName}</strong></Link><nav aria-label="Account navigation"><Link href={brandPath(brand.slug,"security")}>Account security</Link><Link href={brandPath(brand.slug,"login")}>Sign in</Link></nav></header>
    {children}<footer className={s.footer}>{brand.legalName&&<p>{brand.legalName}</p>}{brand.supportName&&<p>{brand.supportName}{brand.supportEmail&&<> · <a href={"mailto:"+brand.supportEmail}>{brand.supportEmail}</a></>}</p>}{brand.poweredBy&&<p>Powered by Always Open Commerce</p>}</footer>
  </div>;
}
