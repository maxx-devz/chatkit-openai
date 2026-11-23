"use client";
import {useCallback,useEffect,useRef,useState} from 'react';
import Link from 'next/link';
import {useAdminDraft} from './admin-draft-provider';
import DocumentDeliveryManager from './document-delivery-manager';
import DocumentBulkUpload from './document-bulk-upload';
import {DOCUMENT_UPLOAD_BATCH_MAX} from '@/lib/client-document-upload-queue';
import {DOCUMENT_UPLOAD_ACCEPT,DOCUMENT_UPLOAD_MAX} from '@/lib/client-document-file-policy';
import s from './client-document-assignments.module.css';
async function readResponse(response){let data;try{data=await response.json();}catch{throw Error('The document request could not be completed. Please try again.');}if(!response.ok){const error=Error(data.error||'The document request could not be completed.');error.status=response.status;throw error;}return data;}
async function loadClient(id,signal){return readResponse(await fetch('/api/admin/client-document-assignments'+(id?'?clientId='+encodeURIComponent(id):''),{cache:'no-store',signal}));}
async function change(client,body,uploaded=false){return readResponse(await fetch(uploaded?'/api/admin/client-document-files':'/api/admin/client-document-assignments',{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json','x-aoc-document-client':client},body:JSON.stringify(body)}));}
const empty={title:'',description:'',url:'',share:true};
function bytesLabel(bytes){if(!Number.isFinite(bytes))return '—';return bytes<1024?bytes+' B':bytes<1048576?(bytes/1024).toFixed(1)+' KB':(bytes/1048576).toFixed(2)+' MB';}
function dateLabel(value){return value?new Date(value).toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric',timeZone:'UTC'}):'';}
function DocumentForm({client,item,uploadsReady,onSaved,onCancel}){
 const baseline=item?{title:item.title,description:item.description||'',url:item.kind==='upload'?'':item.url,share:item.status==='published_link'}:empty;
 const draft=useAdminDraft(`document-reference:${client.id}:${item?.id||'new'}:${item?.revision||'new'}`,baseline);
 const [batch,setBatch]=useState(null);
 const [file,setFile]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[dragging,setDragging]=useState(false);
 const input=useRef(null),pending=useRef(null),uploaded=item?.kind==='upload';
 const share=draft.value.share??baseline.share;const setShare=value=>draft.update(old=>({...old,share:value}));
 function chooseFiles(selected){const incoming=Array.from(selected||[]);if(!incoming.length)return;if(incoming.length>DOCUMENT_UPLOAD_BATCH_MAX){setError('Choose up to '+DOCUMENT_UPLOAD_BATCH_MAX+' files per batch.');return;}if(incoming.length>1){setBatch(incoming);setFile(null);setError('');return;}choose(incoming[0]);}
 function choose(selected){if(!selected)return;if(selected.size>DOCUMENT_UPLOAD_MAX){setError('Each file must be 2 MB or smaller.');return;}setFile(selected);draft.update(old=>({...old,title:selected.name,url:''}));setError('');}
 function update(event){const {name,value}=event.target;draft.update(old=>({...old,[name]:value}));setError('');}
 async function save(event){
  event.preventDefault();if(busy)return;setBusy(true);setError('');
  const values={title:draft.value.title.trim()||file?.name||'',url:draft.value.url,description:draft.value.description||''},fingerprint=JSON.stringify([values,share,item?.id,item?.revision,file&&[file.name,file.size,file.lastModified]]);
  if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,operation:crypto.randomUUID()};
  try{
   let result;
   if(file){const form=new FormData();for(const [key,value] of Object.entries({clientId:client.id,operation:pending.current.operation,title:values.title,description:values.description,share:String(share)}))form.set(key,value);form.set('file',file);
    result=await readResponse(await fetch('/api/admin/client-document-files',{method:'POST',cache:'no-store',headers:{'x-aoc-document-client':client.id},body:form}));
   }else if(uploaded){result=await change(client.id,{action:'update',clientId:client.id,id:item.id,revision:item.revision,operation:pending.current.operation,title:values.title,description:values.description,share},true);
   }else{result=await change(client.id,{action:share?'save_publish':'save',clientId:client.id,...(item?{id:item.id,revision:item.revision}:{}),...values,operation:pending.current.operation,reason:item?'Updated client document':'Added client document',...(share?{confirmed:true}:{})});}
   draft.clear();setFile(null);pending.current=null;if(input.current)input.current.value='';
   await onSaved(result.status==='published_link'?'Document saved and shared with '+client.name+'.':'Document saved as a private draft.');
  }catch(failure){setError(failure.message);}finally{setBusy(false);}
 }
 if(batch)return <DocumentBulkUpload key={client.id} client={client} files={batch} share={share} onShare={setShare} description={draft.value.description||''} onSaved={onSaved} onClose={complete=>{setBatch(null);if(complete)draft.clear();}}/>;
 return <form className={s.quickForm} onSubmit={save} aria-label={item?'Edit document':'Add document'}>
 <fieldset className={s.fields} disabled={busy}>
 <div className={s.quickHeading}><h2>{item?'Edit document':'Add a document'}</h2>{item&&<button type="button" onClick={onCancel}>Cancel edit</button>}</div>
 {!uploaded&&<div className={s.sourceInputs}>
 {!item&&<div className={s.dropzone} data-dragging={dragging} aria-disabled={!uploadsReady} onDragOver={event=>{event.preventDefault();if(uploadsReady&&!busy)setDragging(true);}} onDragLeave={()=>setDragging(false)} onDrop={event=>{event.preventDefault();setDragging(false);if(!uploadsReady||busy)return;chooseFiles(event.dataTransfer.files);}}>
 <input ref={input} className="sr-only" aria-label="Attach a document" type="file" id={'document-file-'+client.id} accept={DOCUMENT_UPLOAD_ACCEPT} multiple disabled={!uploadsReady||busy} onChange={event=>{chooseFiles(event.target.files);event.target.value='';}}/>
 <strong>{file?file.name:'Drop a file here'}</strong><span>{file?bytesLabel(file.size)+' · Ready to save':'PDF, Office, text or image · up to 2 MB each · select multiple files'}</span>
 <div>{file?<button type="button" onClick={()=>{setFile(null);if(input.current)input.current.value='';}}>Remove file</button>:<button type="button" disabled={!uploadsReady} onClick={()=>input.current?.click()}>Choose files</button>}</div>
 </div>}
 <div className={s.linkInput}><label htmlFor={'document-link-'+client.id}>{item?'Google Drive file link':'Or paste a Google Drive link'}</label><input id={'document-link-'+client.id} name="url" type="url" value={draft.value.url} onChange={update} disabled={Boolean(file)} required={!file} maxLength={500} placeholder="https://docs.google.com/…"/>{!uploadsReady&&!item&&<small>File upload storage needs its database setup. Existing Drive links still work.</small>}</div>
 </div>}
 {uploaded&&<p className={s.muted}>Attached file: {item.filename} · {bytesLabel(item.sizeBytes)}</p>}
 <div className={s.quickFields}><div><label htmlFor={'document-title-'+client.id}>Document title</label><input id={'document-title-'+client.id} name="title" value={draft.value.title} onChange={update} required={!file} maxLength={180} placeholder={file?'Uses the filename':'For example: website audit report'}/></div><div><label htmlFor={'document-description-'+client.id}>Description <span className={s.optional}>(optional)</span></label><textarea id={'document-description-'+client.id} name="description" value={draft.value.description} onChange={update} maxLength={1000} rows={2} placeholder="A short note for the client"/></div></div>
 <div className={s.quickSave}><label className={s.checkbox}><input type="checkbox" checked={share} onChange={event=>setShare(event.target.checked)}/>Share with {client.name} when saved</label><button className={s.primary} data-action="add" type="submit">{busy?'Saving…':item?'Save changes':share?'Save & share':'Save draft'}</button></div>
 <small>Share only approved client-facing documents. Uncheck to keep a private draft.</small>
 {error&&<p role="alert" className={s.error}>{error}</p>}
 </fieldset></form>;
}
function DocumentRow({item,client,onEdit,onSaved}){
 const [details,setDetails]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');const pending=useRef(null),uploaded=item.kind==='upload',published=item.status==='published_link';
 async function act(action){
  if(busy)return;
  if(action==='archive'&&!window.confirm(uploaded?'Delete this file from the client portal? Its audit history will remain.':'Delete this portal link? The original Google Drive file will stay unchanged.'))return;
  if(action==='revoke'&&!window.confirm('Unshare this document? It will no longer appear in '+client.name+'’s library.'))return;
  const body={action,clientId:client.id,id:item.id,revision:item.revision,...(!uploaded?{reason:action==='archive'?'Removed client document':action==='publish'?'Shared approved client document':'Unshared client document',...(action==='publish'?{confirmed:true}:{})}:{})};
  const fingerprint=JSON.stringify(body);if(pending.current?.fingerprint!==fingerprint)pending.current={fingerprint,operation:crypto.randomUUID()};
  setBusy(true);setError('');try{await change(client.id,{...body,operation:pending.current.operation},uploaded);pending.current=null;await onSaved(action==='archive'?'Document removed from this library.':action==='publish'?'Document shared with '+client.name+'.':'Document is now private.');}catch(failure){setError(failure.message);}finally{setBusy(false);}
 }
 return <>
 <tr className={s.simpleDocumentRow}><th scope="row"><button type="button" className={s.rowToggle} aria-label={'Document details: '+item.title} aria-expanded={details} onClick={()=>setDetails(!details)}>{item.title}</button><small>{uploaded?item.filename:'Google Drive link'} · {dateLabel(item.updatedAt)}</small></th><td className={s.quickSize}>{bytesLabel(item.sizeBytes)}</td><td><span className={published?s.published:s.saved}>{published?'Shared':'Private draft'}</span></td><td><div className={s.directActions}><a href={item.url} target="_blank" rel="noreferrer">{uploaded?'View / download':'Open'}</a><button type="button" data-action="edit" disabled={busy} onClick={()=>onEdit(item)}>Edit</button>{item.kind!=='folder'&&<button type="button" data-action={published?'neutral':'add'} disabled={busy} onClick={()=>act(published?'revoke':'publish')}>{published?'Unshare':'Share'}</button>}<button type="button" data-action="danger" disabled={busy} onClick={()=>act('archive')}>Delete</button></div></td></tr>
 {(details||error)&&<tr><td colSpan={4} className={s.simpleDetails}>{details&&<p>{item.description||'No description added.'}</p>}{error&&<p role="alert" className={s.error}>{error}</p>}</td></tr>}
 </>;
}
function SelectedClient({id}){
 const [data,setData]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(true),[notice,setNotice]=useState(''),[noticeWarning,setNoticeWarning]=useState(false),[editing,setEditing]=useState(null),[search,setSearch]=useState(''),[sort,setSort]=useState('newest'),[advanced,setAdvanced]=useState(false);const sequence=useRef(0),form=useRef(null);
 const load=useCallback(async signal=>{const token=++sequence.current;setLoading(true);setError('');try{const result=await loadClient(id,signal);if(!signal?.aborted&&token===sequence.current)setData(result);}catch(failure){if(!signal?.aborted&&token===sequence.current){if([401,403,404].includes(failure.status))setData(null);setError(failure.message);}}finally{if(!signal?.aborted&&token===sequence.current)setLoading(false);}},[id]);
 useEffect(()=>{const controller=new AbortController();Promise.resolve().then(()=>load(controller.signal));return()=>controller.abort();},[load]);
 useEffect(()=>{if(editing)form.current?.scrollIntoView({block:'nearest',behavior:'smooth'});},[editing]);
 const saved=async (message,warning=false)=>{setEditing(null);setNotice(message);setNoticeWarning(warning);await load();};
 if(!data)return error?<p role="alert" className={s.error}>{error}<button type="button" onClick={()=>load()}>Try again</button></p>:<p role="status">Loading documents…</p>;
 if(!data.setupReady)return <p role="alert">Document storage needs setup. Existing portal documents are unchanged.</p>;
 const items=data.assignments.filter(item=>[item.title,item.description||'',item.filename||''].some(value=>value.toLowerCase().includes(search.trim().toLowerCase()))).toSorted((a,b)=>sort==='title'?a.title.localeCompare(b.title):sort.startsWith('size')?((a.sizeBytes==null)-(b.sizeBytes==null))||(sort==='size-asc'?(a.sizeBytes||0)-(b.sizeBytes||0):(b.sizeBytes||0)-(a.sizeBytes||0)):(sort==='oldest'?1:-1)*((Date.parse(a.updatedAt)||0)-(Date.parse(b.updatedAt)||0)));
 return <div className={s.manager}>
 {notice&&<p role="status" className={noticeWarning?s.bulkSummary:s.success}>{notice}</p>}{error&&<p role="alert" className={s.error}>{error} Your unsaved inputs are kept; displayed documents may be out of date.</p>}
 <div ref={form}><DocumentForm key={editing?editing.id+':'+editing.revision:'new'} client={data.client} item={editing} uploadsReady={data.uploadsReady!==false} onSaved={saved} onCancel={()=>setEditing(null)}/></div>
 <section className={s.simpleLibrary} aria-label="Saved documents"><div className={s.simpleToolbar}><div><label htmlFor={'document-search-'+id}>Search documents</label><input id={'document-search-'+id} type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Search title, description or filename"/></div><div><label htmlFor={'document-sort-'+id}>Sort documents</label><select id={'document-sort-'+id} value={sort} onChange={event=>setSort(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title A–Z</option><option value="size-asc">Smallest file first</option><option value="size-desc">Largest file first</option></select></div><button type="button" disabled={loading} onClick={()=>load()}>{loading?'Refreshing…':'Refresh documents'}</button></div>
 {data.assignments.length>=100&&<p className={s.muted}>Search covers the loaded document list (up to 100 links and 100 uploads).</p>}
 <div className={s.tableContainer}><table className={s.quickTable}><caption className="sr-only">Documents for {data.client.name}</caption><thead><tr><th scope="col">Document</th><th scope="col">Size</th><th scope="col">Visibility</th><th scope="col">Actions</th></tr></thead><tbody>{items.length?items.map(item=><DocumentRow key={item.id} item={item} client={data.client} onEdit={setEditing} onSaved={saved}/>):<tr><td colSpan={4} className={s.noMatches}>{search?'No matching documents.':'No documents yet. Add a file or link above.'}</td></tr>}</tbody></table></div>
 </section>
 {!!data.history?.length&&<details className={s.card}><summary>Recent admin changes</summary><ul className={s.history}>{data.history.map((entry,index)=><li key={index}><strong>{({upload:'File uploaded',create:'Document added',update:'Document updated',publish:'Document shared',revoke:'Document unshared',archive:'Document removed'})[entry.action]||'Document changed'}</strong> · {entry.reason} <small>{dateLabel(entry.occurredAt)}</small></li>)}</ul></details>}
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
