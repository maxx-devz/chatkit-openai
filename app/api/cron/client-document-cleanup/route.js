import {timingSafeEqual} from 'node:crypto';
import {runDocumentStorageCleanup} from '@/lib/client-document-storage-worker';
export const runtime='nodejs';export const dynamic='force-dynamic';export const maxDuration=300;
export async function GET(request){
 const secret=process.env.SOURCE_SYNC_SECRET||process.env.CRON_SECRET||'',provided=Buffer.from(request.headers.get('authorization')||''),expected=Buffer.from('Bearer '+secret);
 if(secret.length<32||provided.length!==expected.length||!timingSafeEqual(provided,expected))return Response.json({error:'Unauthorized'},{status:401,headers:{'Cache-Control':'no-store'}});
 try{return Response.json(await runDocumentStorageCleanup(),{headers:{'Cache-Control':'no-store'}});}catch{return Response.json({error:'Document storage cleanup needs attention.'},{status:503,headers:{'Cache-Control':'no-store'}});}
}
