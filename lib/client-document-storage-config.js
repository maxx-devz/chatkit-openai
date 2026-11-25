export function documentStorageConfig(){
 const raw=process.env.CLIENT_DOCUMENTS_SUPABASE_URL||'',bucket=process.env.CLIENT_DOCUMENTS_STORAGE_BUCKET||'';
 let url;try{url=new URL(raw);}catch{throw Error('Document Storage needs its private server configuration.');}
 if(url.protocol!=='https:'||!/^[-a-z0-9]+\.supabase\.co$/.test(url.hostname)||url.username||url.password||url.port||url.search||url.hash||url.pathname!=='/'||!/^[a-z0-9][a-z0-9-]{2,62}$/.test(bucket))throw Error('Use the approved Supabase project URL and a private bucket.');
 return {origin:url.origin,bucket};
}
export function documentStorageOrigins(){try{const {origin}=documentStorageConfig();return [origin,origin.replace('.supabase.co','.storage.supabase.co')];}catch{return [];}}
