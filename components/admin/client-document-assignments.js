"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useAdminDraft} from './admin-draft-provider';
import DocumentDeliveryManager from './document-delivery-manager';
import DocumentBulkUpload from './document-bulk-upload';
import DocumentLibraryTable from './document-library-table';
import DocumentPreview from './document-preview';
import {documentPreviewAddress} from '@/lib/document-preview-policy';
import {DOCUMENT_UPLOAD_BATCH_MAX} from '@/lib/client-document-upload-queue';
import {DOCUMENT_UPLOAD_ACCEPT,DOCUMENT_FORMAT_HELP} from '@/lib/client-document-formats';
import {uploadFileProblem} from '@/lib/client-document-upload-queue';
import {uploadClientDocument} from '@/lib/upload-client-document';
import s from './client-document-assignments.module.css';
async function readResponse(response){let data;try{data=await response.json();}catch{const error=Error('The document request could not be completed. Please try again.');if(!response.ok)error.status=response.status;throw error;}if(!response.ok){const error=Error(data.error||'The document request could not be completed.');error.status=response.status;throw error;}return data;}
async function loadClient(id,signal){return readResponse(await fetch('/api/admin/client-document-assignments'+(id?'?clientId='+encodeURIComponent(id):''),{cache:'no-store',signal}));}
async function change(client,body,uploaded=false,storage=false,signal){return readResponse(await fetch(storage?'/api/admin/client-document-storage':uploaded?'/api/admin/client-document-files':'/api/admin/client-document-assignments',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','x-aoc-document-client':client},body:JSON.stringify(body),signal:signal?AbortSignal.any([signal,AbortSignal.timeout(30000)]):AbortSignal.timeout(30000)}));}
const empty={title:'',description:'',url:'',share:true};
function bytesLabel(bytes){if(!Number.isFinite(bytes))return '—';return bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(2)+' MB';}
function dateLabel(value){return value?new Date(value).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}):'';}
function ComposerIcon({type,...props}){
 const paths={upload:<><path d="M12 16V4m-4 4 4-4 4 4"/><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/></>,file:<><path d="M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8Z"/><path d="M14 3v5h5M8 13h8m-8 4h6"/></>,link:<><path d="m10 13 4-4"/><path d="M8 16H6a4 4 0 0 1-3-7l4-4a4 4 0 0 1 6 0m-2 14a4 4 0 0 0 6 0l4-4a4 4 0 0 0-3-7h-2"/></>,shield:<><path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Z"/><path d="m8 12 3 3 5-6"/></>,arrow:<path d="M5 12h14m-5-5 5 5-5 5"/>};
 return <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[type]||paths.file}</svg>;
}
function DocumentForm({client,item,uploadsReady,directUploadsReady,onSaved,onCancel}){
 const baseline=item?{title:item.title,description:item.description||'',url:item.kind==='upload'?'':item.url,share:item.status==='published_link'}:empty;
 const draft=useAdminDraft(`document-reference:${client.id}:${item?.id||'new'}:${item?.revision||'new'}`,baseline);
 const [batch,setBatch]=useState(null);
 const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 const input=useRef(null),pending=useRef(null),uploaded=item?.kind==='upload';
 const share=draft.value.share??baseline.share;const setShare=value=>draft.update(old=>({...old,share:value}));
 function chooseFiles(selected){const incoming=Array.from(selected||[]);if(!incoming.length)return;if(incoming.length>DOCUMENT_UPLOAD_BATCH_MAX){setError('Choose up to '+DOCUMENT_UPLOAD_BATCH_MAX+' files per batch.');return;}if(incoming.length>1){setBatch(incoming);setFile(null);setError('');return;}choose(incoming[0]);}
 function choose(selected){if(!selected)return;const problem=uploadFileProblem(selected);if(problem){setError(problem);return;}setFile(selected);draft.update(old=>({...old,title:selected.name,url:''}));setError('');}
 function update(event){const {name,value}=event.target;draft.update(old=>({...old,[name]:value}));setError('');}
 async function save(event){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  const values={title:draft.value.title.trim()||file?.name||'',url:draft.value.url,description:draft.value.description||''},fingerprint=JSON.stringify([values,share,item?.id,item?.revision,file&&[file.name,file.size,file.lastModified]]);
  if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,operation:crypto.randomUUID()};
  try{
   let result;
   if(file){result=await uploadClientDocument({clientId:client.id,operation:pending.current.operation,title:values.title,description:values.description,share,file,direct:directUploadsReady});
   }else if(uploaded){result=await change(client.id,{action:'update',clientId:client.id,id:item.id,revision:item.revision,operation:pending.current.operation,title:values.title,description:values.description,share},true,item.storage==='supabase');
   }else{result=await change(client.id,{action:share?'save_publish':'save',clientId:client.id,...(item?{id:item.id,revision:item.revision}:{}),...values,operation:pending.current.operation,reason:item?'Updated client document':'Added client document',...(share?{confirmed:true}:{})});}
   draft.clear();setFile(null);pending.current=null;if(input.current)input.current.value='';
   await onSaved(result.status==='published_link'?'Document saved and shared with '+client.name+'.':'Document saved as a private draft.');
  }catch(failure){setError(failure.message);}finally{setBusy(false);}
 }
 if(batch)return <DocumentBulkUpload key={client.id} client={client} files={batch} directUploadsReady={directUploadsReady} share={share} onShare={setShare} description={draft.value.description||''} onSaved={onSaved} onClose={complete=>{setBatch(null);if(complete)draft.clear();}}/>;
 return <form id={'document-form-'+client.id} tabIndex={-1} className={s.quickForm} onSubmit={save} aria-label={item?'Edit document':'Add document'}>
 <fieldset className={s.fields} disabled={busy}>
 <div className={s.composerHeader}>
  <span className={s.composerIcon}><ComposerIcon type="file"/></span>
  <div className={s.composerHeading}><h2>{item?'Edit document':'Add a document'}</h2><p>{item?'Update the details and choose who can see this document.':'Upload files or share a Google Drive link in one step.'}</p></div>
  {item?<button type="button" onClick={onCancel}>Cancel edit</button>:<span className={s.composerClient}>For {client.name}</span>}
 </div>
 <div className={s.composerBody} data-editing={Boolean(item)}>
 {!item&&<div className={s.uploadColumn}>
  <div className={s.dropzone} data-dragging={dragging} data-selected={Boolean(file)} aria-disabled={!uploadsReady} onDragOver={event=>{event.preventDefault();if(uploadsReady&&!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(!uploadsReady||busy)return;chooseFiles(event.dataTransfer.files);}}>
   <input ref={input} className="sr-only" aria-label="Attach a document" type="file" id={'document-file-'+client.id} accept={DOCUMENT_UPLOAD_ACCEPT} multiple disabled={!uploadsReady||busy} onChange={event=>{chooseFiles(event.target.files);event.target.value='';}}/>
   <span className={s.uploadIcon}><ComposerIcon type={file?'file':'upload'} width="28" height="28"/></span>
   <strong>{file?file.name:'Drop a file here'}</strong>
   <span>{file?bytesLabel(file.size)+' · Ready to save':'Drag and drop one or more files, or browse your device.'}</span>
   <div>{file?<button type="button" onClick={()=>{setFile(null);if(input.current)input.current.value='';}}>Remove file</button>:<button type="button" className={s.chooseFiles} disabled={!uploadsReady} onClick={()=>input.current?.click()}>Choose files</button>}</div>
  </div>
  <details className={s.formatHelp}><summary>Supported file types</summary><p>{DOCUMENT_FORMAT_HELP}</p></details>
 </div>}
 <div className={s.documentInputs}>
 {!uploaded&&<div className={s.linkInput}>
  <label htmlFor={'document-link-'+client.id}><ComposerIcon type="link" width="16" height="16"/>{item?'Google Drive file link':'Or paste a Google Drive link'}</label>
  <input id={'document-link-'+client.id} name="url" type="url" value={draft.value.url} onChange={update} disabled={Boolean(file)} required={!file} maxLength={500} placeholder="https://docs.google.com/..."/>
  <small>{file?'Remove the selected file to use a link instead.':'Use an existing file. Google Drive sharing permissions still apply.'}</small>
  {!uploadsReady&&!item&&<small>File upload storage needs its database setup. Existing Drive links still work.</small>}
 </div>}
 {uploaded&&<div className={s.attachedFile}><ComposerIcon type="file"/><div><strong>{item.filename}</strong><small>{bytesLabel(item.sizeBytes)} · Attached file</small></div></div>}
 <div className={s.quickFields}>
  <div><label htmlFor={'document-title-'+client.id}>Document title</label><input id={'document-title-'+client.id} name="title" value={draft.value.title} onChange={update} required={!file} maxLength={180} placeholder={file?'Uses the filename':'For example: website audit report'}/></div>
  <div><label htmlFor={'document-description-'+client.id}>Description <span className={s.optional}>(optional)</span></label><textarea id={'document-description-'+client.id} name="description" value={draft.value.description} onChange={update} maxLength={1000} rows={2} placeholder="Help the client understand what this document is for."/></div>
 </div>
 </div>
 </div>
 {error&&<p role="alert" className={s.composerError+' '+s.error}>{error}</p>}
 <div className={s.composerFooter}>
  <div className={s.visibilityChoice}><span className={s.visibilityIcon}><ComposerIcon type="shield" width="20" height="20"/></span><div><label className={s.checkbox}><input type="checkbox" checked={share} onChange={event=>setShare(event.target.checked)}/>Share with {client.name} when saved</label><small>{share?"Only share approved, client-facing documents.":'Private draft. Only authorized administrators can see it.'}</small></div></div>
  <button className={s.primary+' '+s.composerSubmit} data-action="add" type="submit">{busy?'Saving...':item?'Save changes':share?'Save & share':'Save draft'}<ComposerIcon type="arrow" width="18" height="18"/></button>
 </div>
 </fieldset></form>;
}

function DocumentRow({item,client,onEdit,onSaved,disabled=false,selection,selectionError}){
 const [details,setDetails]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(null),uploaded=item.kind==='upload',published=item.status==='published_link',preview=documentPreviewAddress(item);
 async function act(action){
  if(busy||disabled)return;
  if(action==='archive'&&!window.confirm(uploaded?'Permanently delete this uploaded file from the portal and its storage? Its audit record will remain.':'Delete this portal link? The original Google Drive file will stay unchanged.'))return;
  if(action==='revoke'&&!window.confirm('Unshare this document? It will no longer appear in '+client.name+'’s library.'))return;
  const body={action,clientId:client.id,id:item.id,revision:item.revision,...(!uploaded?{reason:action==='archive'?'Removed client document':action==='publish'?'Shared approved client document':'Unshared client document',...(action==='publish'?{confirmed:true}:{})}:{})};
  const fingerprint=JSON.stringify(body);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,operation:crypto.randomUUID()};
  setBusy(true);setError('');try{const result=await change(client.id,{...body,operation:pending.current.operation},uploaded,item.storage==='supabase');pending.current=null;await onSaved(action==='archive'?(result.storageCleanupPending?'Document removed. Storage cleanup needs a retry; use Retry storage cleanup below.':uploaded?'Document deleted. Uploaded file storage was cleared; audit history is kept.':'Document link removed. The Google Drive original is unchanged.'):action==='publish'?'Document shared with '+client.name+'.':'Document is now private.');}catch(failure){setError(failure.message);}finally{setBusy(false);}
 }
 return <>
 <tr className={s.simpleDocumentRow}><td className={s.selectionCell}><input type="checkbox" aria-label={'Select document: '+item.title} checked={selection?.checked||false} disabled={busy||disabled||selection?.disabled} onChange={event=>selection?.onChange(event.target.checked)}/></td><th scope="row"><button type="button" className={s.rowToggle} aria-label={'Document details: '+item.title} aria-expanded={details} onClick={()=>setDetails(!details)}>{item.title}</button><small>{uploaded?item.filename:'Google Drive link'} · {dateLabel(item.updatedAt)}</small></th><td className={s.quickSize}>{bytesLabel(item.sizeBytes)}</td><td><span className={published?s.published:s.saved}>{published?'Shared':'Private draft'}</span></td><td><div className={s.directActions}>{preview&&<button type="button" aria-expanded={details} onClick={()=>setDetails(!details)}>{details?'Hide preview':'Preview'}</button>}<a href={item.url} target="_blank" rel="noreferrer">{uploaded?'View / download':'Open'}</a><button type="button" data-action="edit" disabled={busy||disabled} onClick={()=>onEdit(item)}>Edit</button>{item.kind!=='folder'&&<button type="button" data-action={published?'neutral':'add'} disabled={busy||disabled} onClick={()=>act(published?'revoke':'publish')}>{published?'Unshare':'Share'}</button>}<button type="button" data-action="danger" disabled={busy||disabled} onClick={()=>act('archive')}>Delete</button></div></td></tr>
 {(details||error||selectionError)&&<tr><td colSpan={5} className={s.simpleDetails}>{details&&<><p>{item.description||'No description added.'}</p>{preview&&<DocumentPreview key={item.id+':'+item.revision} item={item}/>}</>}{(error||selectionError)&&<p role="alert" className={s.error}>{error||selectionError}</p>}</td></tr>}
 </>;
}
function SelectedClient({id}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[noticeWarning,setNoticeWarning]=useState(false),[editing,setEditing]=useState(null),[advanced,setAdvanced]=useState(false),[cleaning,setCleaning]=useState(false);const sequence=useRef(0),form=useRef(null);
 const load=useCallback(async signal=>{const token=++sequence.current;setLoading(true);setError('');try{const result=await loadClient(id,signal);if(!signal?.aborted&&token===sequence.current)setData(result);}catch(failure){if(!signal?.aborted&&token===sequence.current){if([401,403,404].includes(failure.status))setData(null);setError(failure.message);}}finally{if(!signal?.aborted&&token===sequence.current)setLoading(false);}},[id]);
 useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>load(controller.signal));return()=>controller.abort();},[load]);
 useEffect(()=>{if(editing)form.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[editing]);
 const saved=async (message,warning=false)=>{setEditing(null);setNotice(message);setNoticeWarning(warning);await load();};
 if(!data)return error?<p role="alert" className={s.error}>{error}<button type="button" onClick={()=>load()}>Try again</button></p>:<p role="status">Loading documents…</p>;
 if(!data.setupReady)return <p role="alert">Document storage needs setup. Existing portal documents are unchanged.</p>;
 return <div className={s.manager}>
 {notice&&<p role="status" className={noticeWarning?s.bulkSummary:s.success}>{notice}</p>}{error&&<p role="alert" className={s.error}>{error} Your unsaved inputs are kept; displayed documents may be out of date.</p>}
 <div ref={form}><DocumentForm key={editing?editing.id+':'+editing.revision:'new'} client={data.client} item={editing} uploadsReady={data.uploadsReady!==false} directUploadsReady={data.directUploadsReady===true} onSaved={saved} onCancel={()=>setEditing(null)}/></div>
 {data.storageCleanup?.pending>0&&<div className={s.bulkSummary} role="status"><p>{data.storageCleanup.pending} deleted file{data.storageCleanup.pending===1?'':'s'} still need storage cleanup.</p><button type="button" disabled={loading||cleaning} onClick={async()=>{if(cleaning)return;setCleaning(true);try{const result=await change(id,{action:'cleanup',clientId:id},false,true);await saved(result.storageCleanup?.pending?'Some files still need cleanup. Please try again later.':'Storage cleanup completed.',Boolean(result.storageCleanup?.pending));}catch(failure){setError(failure.message);}finally{setCleaning(false);}}}>{cleaning?'Cleaning storage...':'Retry storage cleanup'}</button></div>}
 <DocumentLibraryTable client={data.client} assignments={data.assignments} Row={DocumentRow} onEdit={setEditing} onSaved={saved} onRefresh={load} loading={loading} change={change}/>
 {!!data.history?.length&&<details className={s.card}><summary>Recent admin changes</summary><ul className={s.history}>{data.history.map((entry,index)=><li key={index}><strong>{({upload:'File uploaded',create:'Document added',update:'Document updated',publish:'Document shared',revoke:'Document unshared',archive:'Document removed',storage_rename:'Stored filename updated'})[entry.action]||'Document changed'}</strong> · {entry.reason} <small>{dateLabel(entry.occurredAt)}</small></li>)}</ul></details>}
 <details className={s.advanced} onToggle={event=>{if(event.currentTarget.open)setAdvanced(true);}}><summary>Advanced Google Drive delivery</summary>{advanced&&<DocumentDeliveryManager clientId={id} references={data.assignments.filter(item=>item.kind!=='upload')}/>}</details>
 </div>;
}
export default function ClientDocumentAssignments(){
 const [clients,setClients]=useState(null),[selected,setSelected]=useState(''),[error,setError]=useState('');
 useEffect(()=>{const controller=new AbortController();loadClient('',controller.signal).then(result=>{if(!controller.signal.aborted){setClients(result.clients);if(result.clients.length===1)setSelected(result.clients[0].id);}}).catch(failure=>{if(!controller.signal.aborted)setError(failure.message);});return()=>controller.abort();},[]);
 return <div className={s.manager}>{error?<p role="alert" className={s.error}>{error}</p>:!clients?<p role="status">Loading clients…</p>:!clients.length?<Link href="/admin?view=clients">Create a client first</Link>:<>
 <section className={s.clientChooser}><div><label htmlFor="document-client">Client account</label><select id="document-client" value={selected} onChange={event=>setSelected(event.target.value)}><option value="">Choose a client</option>{clients.map(client=><option key={client.id} value={client.id}>{client.name}{client.enabled?'':' (portal paused)'}</option>)}</select></div><p>Select the client, add a file or link, then save. Existing documents are listed below.</p></section>
 {selected?<SelectedClient key={selected} id={selected}/>:<p className={s.muted}>Choose a client to manage their documents.</p>}
 </>}</div>;
}
