import { brandView,saveBrand,requestBrandDomain,brandedAgencyExport } from "@/lib/agency-branding";
import { platformError,platformResponse } from "@/lib/platform-console";
import { assertTrustedOrigin,readJsonRequest } from "@/lib/request-security";
export const dynamic="force-dynamic";
export async function GET(request) {
  try {
    const params=new URL(request.url).searchParams,slug=params.get("agency"),format=params.get("download");
    if(format) {
      if(!["csv","json"].includes(format))return platformResponse({error:"Unsupported format."},400);
      const result=await brandedAgencyExport(request.headers,slug,format);
      const headers={"Cache-Control":"private, no-store","Vary":"Cookie","X-Content-Type-Options":"nosniff","Content-Disposition":`attachment; filename="agency-report.${format}"`};
      return format==="csv"?new Response(result,{headers:{...headers,"Content-Type":"text/csv; charset=utf-8"}}):Response.json(result,{headers});
    }
    return platformResponse(await brandView(request.headers,slug));
  }catch(error){return platformError(error);}
}
export async function POST(request) {
  try {assertTrustedOrigin(request.headers);const body=await readJsonRequest(request,700000),params=new URL(request.url).searchParams;
    return platformResponse(params.get("action")==="domain"?await requestBrandDomain(request.headers,params.get("agency"),body):await saveBrand(request.headers,params.get("agency"),body));
  }catch(error){return platformError(error);}
}
