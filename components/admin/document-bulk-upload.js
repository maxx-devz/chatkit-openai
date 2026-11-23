"use client";
import {useEffect,useRef,useState} from 'react';
import {useAdminDraft} from './admin-draft-provider';
import {DOCUMENT_UPLOAD_ACCEPT} from '@/lib/client-document-file-policy';
import {DOCUMENT_UPLOAD_BATCH_MAX,uploadFileProblem,uploadQueueCounts} from '@/lib/client-document-upload-queue';
import s from './client-document-assignments.module.css';

const labels={ready:'Ready',uploading:'Uploading…',saved:'Saved',failed:'Failed',unknown:'Not confirmed',invalid:'Check file'};
const size=value=>value<1024?value+' B':value<1048576?(value/1024).toFixed(1)+' KB':(value/1048576).toFixed(2)+' MB';
function entry(file){const error=uploadFileProblem(file);return {id:crypto.randomUUID(),file,title:file.name,status:error?'invalid':'ready',error,operation:crypto.randomUUID(),payload:null};}

export default function DocumentBulkUpload({client,files,share,onShare,description,onSaved,onClose}){
 const [rows,setRows]=useState(()=>files.map(entry));
 const [busy,setBusy]=useState(false),[started,setStarted]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState('');
 const rowsRef=useRef(rows),input=useRef(null),alive=useRef(true),active=useRef(false),stop=useRef(false),controller=useRef(null);
 const draft=useAdminDraft('document-upload-queue:'+client.id,{pending:false}),draftRef=useRef(draft);
 useEffect(()=>{draftRef.current=draft;},[draft]);
 const counts=uploadQueueCounts(rows);
 const hasPending=rows.some(row=>row.status!=='saved');
 useEffect(()=>{draftRef.current.update({pending:hasPending});return()=>draftRef.current.clear();},[hasPending,client.id]); // File objects stay in memory, never browser storage.
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current=true;controller.current?.abort();};},[]);

 function replace(next){rowsRef.current=next;if(alive.current)setRows(next);}
 function patch(id,value){replace(rowsRef.current.map(row=>row.id===id?{...row,...value}:row));}
 function add(selected){
  const incoming=Array.from(selected||[]);if(!incoming.length)return;
  if(rowsRef.current.length+incoming.length>DOCUMENT_UPLOAD_BATCH_MAX){setError('Choose up to '+DOCUMENT_UPLOAD_BATCH_MAX+' files per batch. No additional files were added.');return;}
  replace([...rowsRef.current,...incoming.map(entry)]);setError('');
 }
 async function run(event){
  event?.preventDefault();if(active.current)return;
  active.current=true;stop.current=false;setBusy(true);setStarted(true);setError('');setMessage('');let savedNow=0,denied=false;
  const selected=rowsRef.current.filter(row=>['ready','failed','unknown'].includes(row.status));
  try{
   for(const item of selected){
    if(stop.current||!alive.current)break;
    const row=rowsRef.current.find(value=>value.id===item.id);
    // Freeze each attempted request. Retries use identical metadata and the same operation UUID.
    const payload=row.payload||{title:row.title.trim()||row.file.name,description:description||'',share};
    patch(row.id,{status:'uploading',error:'',payload});
    const form=new FormData();for(const [key,value] of Object.entries({clientId:client.id,operation:row.operation,title:payload.title,description:payload.description,share:String(payload.share)}))form.set(key,value);form.set('file',row.file);
    const abort=new AbortController();controller.current=abort;let timedOut=false;
    const timer=setTimeout(()=>{timedOut=true;abort.abort();},35000);
    try{
     const response=await fetch('/api/admin/client-document-files',{method:'POST',cache:'no-store',headers:{'x-aoc-document-client':client.id},body:form,signal:abort.signal});
     let data;try{data=await response.json();}catch{const failure=Error('The upload result could not be confirmed. Retry to check it safely.');if(!response.ok)failure.status=response.status;throw failure;}
     if(!response.ok){const failure=Error(data.error||'This file could not be saved.');failure.status=response.status;throw failure;}
     if(!data.saved||!data.id||!['published_link','saved_not_published'].includes(data.status))throw Error('The upload result could not be confirmed. Retry to check it safely.');
     if(!alive.current)break;
     patch(row.id,{status:'saved',visibility:data.status==='published_link'?'Shared':'Private draft',error:''});savedNow++;
    }catch(failure){
     if(!alive.current)break;
     const unknown=!failure.status;
     patch(row.id,{status:unknown?'unknown':'failed',error:timedOut?'The upload timed out. Retry to confirm whether it was saved.':failure.message});
     if([401,403,404,409,413,429,503].includes(failure.status)){stop.current=true;denied=[401,403,404].includes(failure.status);}
    }finally{clearTimeout(timer);if(controller.current===abort)controller.current=null;}
   }
   if(alive.current){
    const result=uploadQueueCounts(rowsRef.current);
    const summary=result.saved+' of '+result.total+' files saved'+(result.failed?' · '+result.failed+' need attention':'')+(result.ready?' · '+result.ready+' not uploaded yet':'')+'.';
    setMessage((stop.current?'Queue stopped. ':'')+summary);
    if(savedNow||denied)await onSaved(summary,result.failed>0||result.ready>0); // Preserve the per-file results while refreshing the library.
   }
  }finally{active.current=false;if(alive.current)setBusy(false);}
 }
 const retryable=rows.some(row=>['ready','failed','unknown'].includes(row.status));
 return <section className={s.bulkUpload} aria-label="Bulk document upload">
  <div className={s.quickHeading}><div><h2>Upload documents for {client.name}</h2><p>Up to {DOCUMENT_UPLOAD_BATCH_MAX} files · 2 MB each. Files upload individually; successful uploads stay saved.</p></div></div>
  <form onSubmit={run}>
   {!started&&<div className={s.bulkSettings}><label className={s.checkbox}><input type="checkbox" checked={share} onChange={event=>onShare(event.target.checked)}/>Share with {client.name} when saved</label><button type="button" onClick={()=>input.current?.click()}>Add more files</button><input ref={input} className="sr-only" aria-label="Add files to upload queue" type="file" accept={DOCUMENT_UPLOAD_ACCEPT} multiple onChange={event=>{add(event.target.files);event.target.value='';}}/></div>}
   {started&&<p className={s.muted}>Visibility and attempted file details are locked for safe retries. Saved documents can be edited in the library.</p>}
   {description&&<p className={s.muted}>Description for these files: {description}</p>}
   <div className={s.bulkProgress}><progress aria-label="Files processed" max={Math.max(counts.total,1)} value={counts.processed}/><span>{counts.saved} saved · {counts.failed} need attention · {counts.ready} ready</span></div>
   <ul className={s.bulkList}>{rows.map(row=><li key={row.id} data-status={row.status}>
    <div className={s.bulkIdentity}><strong>{row.file.name}</strong><small>{size(row.file.size)}</small></div>
    <label className={s.bulkTitle}>Document title<input aria-label={'Title for '+row.file.name} maxLength={180} value={row.title} disabled={busy||Boolean(row.payload)||row.status==='invalid'} onChange={event=>patch(row.id,{title:event.target.value})}/></label>
    <div className={s.bulkResult}><span>{row.status==='saved'?row.visibility:labels[row.status]}</span>{row.error&&<p>{row.error}</p>}{!started&&<button type="button" aria-label={'Remove '+row.file.name} onClick={()=>replace(rowsRef.current.filter(item=>item.id!==row.id))}>Remove</button>}</div>
   </li>)}</ul>
   {error&&<p role="alert" className={s.error}>{error}</p>}{message&&<p role="status" className={s.bulkSummary}>{message}</p>}
   <div className={s.actions}>
    {busy?<button type="button" onClick={()=>{stop.current=true;setMessage('Stopping after the current file. Files already saved will stay in the library.');}}>Stop after current file</button>:<>
     {retryable&&<button className={s.primary} type="submit">{started?'Retry / continue uploads':share?'Upload & share files':'Upload private drafts'}</button>}
     <button type="button" onClick={()=>onClose(!hasPending)}>{started?'Close upload results':'Back to single document'}</button>
    </>}
   </div>
   <p className={s.muted}>Keep this page open while uploading. Switching clients stops files that have not started; a file already being saved may still finish for the original client. Nothing is moved to another client.</p>
  </form>
 </section>;
}
