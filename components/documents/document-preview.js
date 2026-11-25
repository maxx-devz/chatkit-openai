"use client";
import {useCallback,useEffect,useState} from 'react';
import {documentPreviewAddress,documentPreviewKind} from '@/lib/document-preview-policy';
import s from './document-preview.module.css';
function PrivatePdf({url,title,onLoad,onError}){
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  const controller=new AbortController();
  (async()=>{try{
   const response=await fetch(url,{cache:'no-store',credentials:'same-origin',headers:{Range:'bytes=0-0'},signal:AbortSignal.any([controller.signal,AbortSignal.timeout(30000)])});
   const valid=response.ok&&response.headers.get('Content-Type')?.split(';')[0]==='application/pdf';await response.body?.cancel();
   if(!valid)throw Error('Preview unavailable');if(!controller.signal.aborted)setReady(true);
  }catch{if(!controller.signal.aborted)onError();}})();
  return ()=>controller.abort();
 },[url,onError]);
 return ready?<iframe src={url} title={'PDF preview: '+title} className={s.previewPdf} referrerPolicy="no-referrer" onLoad={onLoad} onError={onError}/>:null;
}
export default function DocumentPreview({item,smallerImage=false}){
 const [failed,setFailed]=useState(false),[version,setVersion]=useState(0),[loading,setLoading]=useState(true),url=documentPreviewAddress(item),kind=documentPreviewKind(item.mimeType);
 const loaded=useCallback(()=>setLoading(false),[]),unavailable=useCallback(()=>{setFailed(true);setLoading(false);},[]);
 const imageUrl=url&&smallerImage&&kind==='image'?url+'&preview=half':url;
 if(!url)return null;
 return <section className={s.documentPreview} aria-label={'Preview: '+item.title}>
 <div className={s.previewHeading}><strong>{kind==='pdf'?'PDF preview':'Image preview'}</strong><a href={url} target="_blank" rel="noreferrer">Open full preview</a></div>
 {failed?<div role="alert"><p>Preview could not be loaded. Retry, open the original, or download the file.</p><button type="button" onClick={()=>{setFailed(false);setLoading(true);setVersion(value=>value+1);}}>Retry preview</button></div>:<>
 {loading&&<p role="status">Loading preview…</p>}
 {kind==='image'?<img /* eslint-disable-line @next/next/no-img-element -- Private authenticated endpoint; no public image optimization. */
  key={version} src={imageUrl} loading="lazy" decoding="async" alt={item.title} className={s.previewImage} referrerPolicy="no-referrer" onLoad={loaded} onError={unavailable}/>:<PrivatePdf key={version} url={url} title={item.title} onLoad={loaded} onError={unavailable}/>}
 </>}
 {kind==='pdf'&&<p className={s.muted}>If your browser cannot display this PDF, use Open full preview or View / download.</p>}
 </section>;
}
