export function documentPreviewKind(mime){return mime==='application/pdf'?'pdf':['image/png','image/jpeg','image/webp','image/gif'].includes(mime)?'image':null;}
export function documentPreviewAddress(item){
 if(item?.kind!=='upload'||!documentPreviewKind(item.mimeType)||typeof item.url!=='string')return null;
 try{const u=new URL(item.url,'https://preview.invalid');if(u.origin!=='https://preview.invalid'||!/^\/api\/(?:admin\/client-document-(?:files|storage)|client-documents)\/[^/]+$/.test(u.pathname))return null;u.searchParams.set('mode','view');return u.pathname+u.search;}catch{return null;}
}
export function documentPreviewRange(range,size){
 if(!range)return null;const match=/^bytes=([0-9]*)-([0-9]*)$/.exec(range);
 if(!match||!match[1]&&!match[2]||!Number.isSafeInteger(size)||size<=0)throw Error('Invalid preview range');
 const first=match[1]?Number(match[1]):null,last=match[2]?Number(match[2]):null;
 if(first!==null&&(!Number.isSafeInteger(first)||first>=size)||last!==null&&(!Number.isSafeInteger(last)||first===null&&last<=0)||first!==null&&last!==null&&last<first)throw Error('Invalid preview range');
 return first===null?'bytes='+Math.max(0,size-last)+'-'+(size-1):'bytes='+first+'-'+Math.min(last??size-1,size-1);
}
export function documentInlineDisposition(filename){const fallback=filename.replace(/[^a-zA-Z0-9._ -]/g,'_').replace(/^\.+/,'').slice(0,160)||'document';const encoded=encodeURIComponent(filename).replace(/['()*]/g,char=>'%'+char.charCodeAt(0).toString(16).toUpperCase());return `inline; filename="${fallback}"; filename*=UTF-8''${encoded}`;}
