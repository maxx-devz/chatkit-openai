import { checkBrandDomain } from "@/lib/agency-branding";
import { consoleMutation,exactKeys } from "@/lib/platform-console";
export const dynamic="force-dynamic";
export async function POST(request){return consoleMutation(request,async(headers,body)=>{exactKeys(body,["hostname"]);return checkBrandDomain(headers,body.hostname);});}
