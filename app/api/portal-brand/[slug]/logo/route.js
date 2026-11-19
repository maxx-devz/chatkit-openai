import { databasePool } from "@/lib/database";
import { publicBrand } from "@/lib/agency-branding";
export const dynamic="force-dynamic";
export async function GET(request,{params}) {
  try{const {slug}=await params;await publicBrand(slug);const revision=new URL(request.url).searchParams.get("revision");if(!/^\d{1,18}$/.test(revision||""))throw Error();
    const logo=(await databasePool.query("SELECT agency_platform.brand_logo($1,$2) data",[slug,revision])).rows[0].data;if(!logo)throw Error();
    return new Response(new Uint8Array(logo),{headers:{"Content-Type":"image/png","Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","Content-Security-Policy":"default-src 'none'; sandbox","Content-Disposition":"inline; filename=agency-logo.png"}});
  }catch{return new Response(null,{status:404,headers:{"Cache-Control":"private, no-store"}});}
}
