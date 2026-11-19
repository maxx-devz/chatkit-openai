import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { publicBrand,brandView } from "@/lib/agency-branding";
import { BRAND_SCREENS,brandPath } from "@/lib/agency-branding-policy";
import BrandFrame from "@/components/agency/brand-frame";
import BrandingEditor from "@/components/agency/branding-editor";
import AgencyPage from "@/components/agency/agency-page";
import AccountControls from "@/components/auth/account-controls";
import LoginForm from "@/components/auth/login-form";
import { isPortalAuthConfigured } from "@/lib/auth";
import loginStyles from "@/components/auth/login.module.css";
import AccessDenied from "@/components/platform/access-denied";
export const dynamic="force-dynamic";
export const metadata={title:"Agency portal",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function Page({params}) {
 const {slug,screen}=await params;if(!BRAND_SCREENS.includes(screen))notFound();let brand;
 try{brand=await publicBrand(slug);}catch{notFound();}
 let content;
 if(screen==="login")content=<main className={loginStyles.page}><section className={loginStyles.card}><h1>Sign in to {brand.portalName}</h1><p>Use your existing account. Workspace permissions are checked after sign-in.</p><LoginForm configured={isPortalAuthConfigured()} agencySlug={slug}/></section></main>;
 else if(["security","mfa","recovery","reset","verify","invitation"].includes(screen))content=<AccountControls mode={screen} agencySlug={slug}/>;
 else if(screen==="branding"){let data;try{data=await brandView(await headers(),slug);}catch{}content=data?<BrandingEditor key={slug} initial={data}/>:<AccessDenied title="Agency owner or staff access required"/>;}
 else if(screen==="specialists")content=<main><p>Specialist assignments remain in the independently authorized approval area.</p><a href={"/admin/agency/specialists?agency="+slug}>Open specialist approvals</a><a href={brandPath(slug,"clients")}>Agency home</a></main>;
 else content=<AgencyPage searchParams={Promise.resolve({agency:slug})} view={screen} brandedSlug={slug}/>;
 return <BrandFrame brand={brand}>{content}</BrandFrame>;
}
